import { Duplex } from 'stream';
import net from 'net';
import dotenv from 'dotenv';
import { SerialPort } from 'serialport';
import mqtt from 'mqtt';
import { access } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

dotenv.config();

const SERIAL_WAIT_INTERVAL_MS = 500;
const DEFAULT_SERIAL_WAIT_TIMEOUT_MS = 15000;

const isTcpConnection = (serialPath: string) => serialPath.includes(':');

const resolveSerialWaitTimeout = () => {
  const raw = process.env.SERIAL_PATH_WAIT_TIMEOUT_MS ?? '';
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_SERIAL_WAIT_TIMEOUT_MS;
  }

  return parsed;
};

const SERIAL_WAIT_TIMEOUT_MS = resolveSerialWaitTimeout();

const waitForSerialDevice = async (serialPath: string) => {
  const startedAt = Date.now();

  while (true) {
    try {
      await access(serialPath);
      return;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error && error.code && error.code !== 'ENOENT' && error.code !== 'ENODEV') {
        throw error;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed >= SERIAL_WAIT_TIMEOUT_MS) {
        throw new Error(
          `시리얼 포트 경로(${serialPath})를 ${SERIAL_WAIT_TIMEOUT_MS}ms 내에 찾지 못했습니다.`,
        );
      }

      await delay(SERIAL_WAIT_INTERVAL_MS);
    }
  }
};

const openSerialPort = (port: SerialPort) =>
  new Promise<void>((resolve, reject) => {
    port.open((err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });

export interface BridgeOptions {
  serialPath: string;
  baudRate: number;
  mqttUrl: string;
  devices: any[];
}

export class HomeNetBridge {
  private readonly options: BridgeOptions;
  private readonly client: mqtt.MqttClient;
  private port?: Duplex;
  private startPromise: Promise<void> | null = null;

  private receiveBuffer = Buffer.alloc(0);
  private stateCache = new Map<string, any>();

  constructor(options: BridgeOptions) {
    this.options = options;
    this.client = mqtt.connect(options.mqttUrl);
  }

  start() {
    if (!this.startPromise) {
      this.startPromise = this.initialize();
    }
    return this.startPromise;
  }

  async stop() {
    if (this.startPromise) {
      await this.startPromise.catch(() => {});
    }
    this.client.end();
    if (this.port) {
      this.port.removeAllListeners();
      this.port.destroy();
      this.port = undefined;
    }
    this.startPromise = null;
    this.stateCache.clear();
    this.receiveBuffer = Buffer.alloc(0);
  }

  private async initialize() {
    const { serialPath, baudRate } = this.options;

    this.client.on('connect', () => {
      console.log(`[core] MQTT에 연결되었습니다: ${this.options.mqttUrl}`);
    });

    this.client.on('error', (err) => {
      console.error('[core] MQTT 연결 오류:', err);
    });

    if (isTcpConnection(serialPath)) {
      const [host, port] = serialPath.split(':');
      this.port = net.createConnection({ host, port: Number(port) });
    } else {
      await waitForSerialDevice(serialPath);
      const serialPort = new SerialPort({ path: serialPath, baudRate, autoOpen: false });
      this.port = serialPort;
      await openSerialPort(serialPort);
    }

    this.port.on('data', (data) => this.handleData(data));
    this.port.on('error', (err) => {
      console.error(`[core] 시리얼 포트 오류(${this.options.serialPath}):`, err);
    });
  }

  private handleData(chunk: Buffer) {
    console.log(`[core] Raw data received: ${chunk.toString('hex')}`);
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);

    while (this.receiveBuffer.length > 0) {
      const packetDef = this.findPacketDefinition(this.receiveBuffer);

      if (!packetDef) {
        // No matching packet definition found, discard one byte and retry
        // This is a simple recovery mechanism for misaligned streams
        this.receiveBuffer = this.receiveBuffer.slice(1);
        continue;
      }

      if (this.receiveBuffer.length < packetDef.length) {
        // Buffer does not contain a full packet yet
        break;
      }

      const packetData = this.receiveBuffer.slice(0, packetDef.length);
      this.client.publish('homenet/raw', packetData); // Publish raw packet
      this.processPacket(packetData, packetDef);

      this.receiveBuffer = this.receiveBuffer.slice(packetDef.length);
    }
  }

  private findPacketDefinition(buffer: Buffer) {
    for (const device of this.options.devices) {
      for (const packetDef of device.packets) {
        const header = Buffer.from(packetDef.header);
        if (buffer.length >= header.length && buffer.compare(header, 0, header.length, 0, header.length) === 0) {
          return packetDef;
        }
      }
    }
    return null;
  }

  private processPacket(packetData: Buffer, packetDef: any) {
    for (const item of packetDef.items) {
      if (!item.state) continue;

      // Normalize state definitions
      const states = Array.isArray(item.state) ? item.state : [item.state];

      for (const stateDef of states) {
        const { offset, mask, transform, name: stateName } = stateDef;
        if (offset === undefined) continue;

        const rawValue = packetData.readUInt8(offset);
        let value: any;

        if (mask) {
          value = (rawValue & mask) !== 0; // Treat masked values as boolean
        } else {
          value = rawValue;
        }

        if (transform === 'bcd_decode') {
          value = this.bcdDecode(value);
        }

        // For climate-like devices with multiple state values
        const subId = stateName || item.id;
        const cacheKey = `${item.id}/${subId}`;
        const topic = `homenet/${item.id}/${stateName || 'state'}`;
        let payload = String(value);

        if (item.type === 'light' || item.type === 'switch' || item.type === 'valve') {
          payload = value ? 'ON' : 'OFF';
        }

        if (this.stateCache.get(cacheKey) !== payload) {
          this.stateCache.set(cacheKey, payload);
          this.client.publish(topic, payload, { retain: true });
          console.log(`[core] MQTT 발행: ${topic} -> ${payload}`);
        }
      }
    }
  }

  private bcdDecode(byte: number): number {
    return (byte >> 4) * 10 + (byte & 0x0f);
  }
}
export function createBridge(options: BridgeOptions) {
  return new HomeNetBridge(options);
}
