// packages/core/src/index.ts

import { Duplex } from 'stream';
import net from 'net';
import dotenv from 'dotenv';
import { SerialPort } from 'serialport';
import mqtt from 'mqtt';
import { access, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import yaml from 'js-yaml'; // Import js-yaml

// Import new configuration interfaces and PacketProcessor
import {
  HomenetBridgeConfig,
  DeviceConfig,
  EntityConfig,
  LightEntity,
  ClimateEntity,
  ValveEntity,
  ButtonEntity,
  SensorEntity,
  FanEntity,
  SwitchEntity,
  BinarySensorEntity,
  CommandSchema
} from './config';
import { PacketProcessor } from './packetProcessor';

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

// Redefine BridgeOptions to use the new HomenetBridgeConfig
export interface BridgeOptions {
  configPath: string; // Path to the homenet_bridge.yaml configuration file
  mqttUrl: string;
}

export class HomeNetBridge {
  private readonly options: BridgeOptions;
  private readonly client: mqtt.MqttClient;
  private port?: Duplex;
  private startPromise: Promise<void> | null = null;

  private receiveBuffer = Buffer.alloc(0);
  private stateCache = new Map<string, any>();

  private config?: HomenetBridgeConfig; // Loaded configuration
  private packetProcessor?: PacketProcessor; // The new packet processor

  constructor(options: BridgeOptions) {
    this.options = options;
    this.client = mqtt.connect(options.mqttUrl);
  }

  async start() {
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
    // 1. Load configuration
    console.log(`[core] Loading configuration from: ${this.options.configPath}`);
    const configFileContent = await readFile(this.options.configPath, 'utf8');
    const loadedYaml = yaml.load(configFileContent);

    if (!loadedYaml || !(loadedYaml as any).homenet_bridge) {
      throw new Error('Invalid configuration file structure. Missing "homenet_bridge" top-level key.');
    }
    
    this.config = (loadedYaml as any).homenet_bridge as HomenetBridgeConfig;
    this.packetProcessor = new PacketProcessor(this.config);


    const { serial: serialConfig } = this.config;

    this.client.on('connect', () => {
      console.log(`[core] MQTT에 연결되었습니다: ${this.options.mqttUrl}`);
      // Subscribe to command topics for all entities
      this.config?.devices.forEach(device => {
        device.entities.forEach(entity => {
          const baseTopic = `homenet/${entity.id}`;
          this.client.subscribe(`${baseTopic}/set/#`, (err) => { // Example: homenet/light_1/set/on, homenet/climate_1/set/temperature
            if (err) console.error(`[core] Failed to subscribe to ${baseTopic}/set/#:`, err);
            else console.log(`[core] Subscribed to ${baseTopic}/set/#`);
          });
        });
      });
    });

    this.client.on('message', (topic, message) => this.handleMqttMessage(topic, message));

    this.client.on('error', (err) => {
      console.error('[core] MQTT 연결 오류:', err);
    });
    
    // Open serial port
    const serialPath = process.env.SERIAL_PATH || '/dev/ttyUSB0'; // Use environment variable for serial path, or fallback
    const baudRate = serialConfig.baud_rate; // Get baud rate from config

    if (isTcpConnection(serialPath)) {
      const [host, port] = serialPath.split(':');
      this.port = net.createConnection({ host, port: Number(port) });
    } else {
      await waitForSerialDevice(serialPath);
      const serialPort = new SerialPort({
        path: serialPath,
        baudRate,
        dataBits: serialConfig.data_bits,
        parity: serialConfig.parity,
        stopBits: serialConfig.stop_bits,
        autoOpen: false
      });
      this.port = serialPort;
      await openSerialPort(serialPort);
    }

    this.port.on('data', (data) => this.handleData(data));
    this.port.on('error', (err) => {
      console.error(`[core] 시리얼 포트 오류(${serialPath}):`, err);
    });
  }

  private handleData(chunk: Buffer) {
    console.log(`[core] Raw data received: ${chunk.toString('hex')}`);
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);

    if (!this.config || !this.packetProcessor) {
      console.error("[core] Configuration or PacketProcessor not initialized.");
      return;
    }

    const allEntities: EntityConfig[] = this.config.devices.flatMap(device => device.entities);
    
    const parsedStates = this.packetProcessor.parseIncomingPacket(this.receiveBuffer.toJSON().data, allEntities);

    if (parsedStates.length > 0) {
        parsedStates.forEach(parsed => {
            const entity = allEntities.find(e => e.id === parsed.entityId);
            if (entity) {
                const topic = `homenet/${entity.id}/state`;
                const payload = JSON.stringify(parsed.state);
                if (this.stateCache.get(topic) !== payload) {
                    this.stateCache.set(topic, payload);
                    this.client.publish(topic, payload, { retain: true });
                    console.log(`[core] MQTT 발행: ${topic} -> ${payload}`);
                }
            }
        });
        this.receiveBuffer = Buffer.alloc(0);
    } else {
        this.receiveBuffer = this.receiveBuffer.slice(1);
    }
  }

  private handleMqttMessage(topic: string, message: Buffer) {
    if (!this.config || !this.packetProcessor || !this.port) {
      console.error("[core] Configuration, PacketProcessor or Serial Port not initialized.");
      return;
    }

    console.log(`[core] MQTT 메시지 수신: ${topic} -> ${message.toString()}`);

    const parts = topic.split('/');
    if (parts.length < 4 || parts[0] !== 'homenet' || parts[2] !== 'set') {
      console.warn(`[core] Unhandled MQTT topic format: ${topic}`);
      return;
    }

    const entityId = parts[1];
    const commandName = `command_${parts[3]}`;

    const payload = message.toString();
    let commandValue: number | string | undefined = undefined;

    if (['command_temperature', 'command_speed'].includes(commandName)) {
        const num = parseFloat(payload);
        if (!isNaN(num)) {
            commandValue = num;
        } else {
            commandValue = payload;
        }
    } else {
        commandValue = payload;
    }

    const targetEntity = this.config.devices.flatMap(d => d.entities).find(e => e.id === entityId);

    if (targetEntity) {
      const commandPacket = this.packetProcessor.constructCommandPacket(targetEntity, commandName, commandValue);
      if (commandPacket) {
        console.log(`[core] Sending command packet for ${targetEntity.name} (${commandName}): ${Buffer.from(commandPacket).toString('hex')}`);
        this.port.write(Buffer.from(commandPacket));
      } else {
        console.warn(`[core] Failed to construct command packet for ${targetEntity.name} (${commandName}).`);
      }
    } else {
      console.warn(`[core] Entity with ID ${entityId} not found.`);
    }
  }
}

export async function createBridge(configPath: string, mqttUrl: string) {
  const bridge = new HomeNetBridge({ configPath, mqttUrl });
  await bridge.start(); // Ensure initialization completes before returning
  return bridge;
}