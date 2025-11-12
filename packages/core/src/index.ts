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
import { logger } from './logger.js';
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
} from './config.js';
import { PacketProcessor } from './packetProcessor.js';

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
    logger.info(`[core] Loading configuration from: ${this.options.configPath}`);
    const configFileContent = await readFile(this.options.configPath, 'utf8');
    const loadedYaml = yaml.load(configFileContent);

    if (!loadedYaml || !(loadedYaml as any).homenet_bridge) {
      throw new Error('Invalid configuration file structure. Missing "homenet_bridge" top-level key.');
    }
    
    this.config = (loadedYaml as any).homenet_bridge as HomenetBridgeConfig;
    this.packetProcessor = new PacketProcessor(this.config);


    const { serial: serialConfig } = this.config;

    this.client.on('connect', () => {
      logger.info(`[core] MQTT에 연결되었습니다: ${this.options.mqttUrl}`);
      // Subscribe to command topics for all entities
      this.config?.devices.forEach(device => {
        device.entities.forEach(entity => {
          const baseTopic = `homenet/${entity.id}`;
          this.client.subscribe(`${baseTopic}/set/#`, (err) => { // Example: homenet/light_1/set/on, homenet/climate_1/set/temperature
            if (err) logger.error({ err, topic: `${baseTopic}/set/#` }, `[core] Failed to subscribe`);
            else logger.info(`[core] Subscribed to ${baseTopic}/set/#`);
          });
        });
      });
    });

    this.client.on('message', (topic, message) => this.handleMqttMessage(topic, message));

    this.client.on('error', (err) => {
      logger.error({ err }, '[core] MQTT 연결 오류');
    });
    
    // Open serial port
    const serialPath = process.env.SERIAL_PORT || '/simshare/rs485-sim-tty'; // Use environment variable for serial path, or fallback
    const baudRate = serialConfig.baud_rate; // Get baud rate from config

    logger.info({ serialPath, baudRate }, '[core] 시리얼 포트 연결 시도');

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
      logger.error({ err, serialPath }, '[core] 시리얼 포트 오류');
    });
  }

  private handleData(chunk: Buffer) {
    logger.debug({ data: chunk.toString('hex') }, '[core] Raw data received');
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);

    if (!this.config || !this.packetProcessor) {
      logger.error("[core] Configuration or PacketProcessor not initialized.");
      return;
    }

    const allEntities: EntityConfig[] = this.config.devices.flatMap(device => device.entities);
    const packetLength = this.config.packet_defaults?.rx_length;

    if (packetLength === undefined) {
      logger.error("[core] 'rx_length' is not defined in packet_defaults. Using default of 8.");
      // To prevent infinite loops, we discard the buffer if length is not specified.
      // This should ideally not happen if config is validated, but as a fallback.
      this.receiveBuffer = Buffer.alloc(0);
      return;
    }

    let bufferWasProcessed = true;
    while (this.receiveBuffer.length >= packetLength && bufferWasProcessed) {
      bufferWasProcessed = false;

      const packet = this.receiveBuffer.slice(0, packetLength);
      const parsedStates = this.packetProcessor.parseIncomingPacket(packet.toJSON().data, allEntities);

      if (parsedStates.length > 0) {
        parsedStates.forEach(parsed => {
          const entity = allEntities.find(e => e.id === parsed.entityId);
          if (entity) {
            const topic = `homenet/${entity.id}/state`;
            const payload = JSON.stringify(parsed.state);
            if (this.stateCache.get(topic) !== payload) {
              this.stateCache.set(topic, payload);
              this.client.publish(topic, payload, { retain: true });
              logger.info({ topic, payload }, '[core] MQTT 발행');
            }
          }
        });
        // Successfully parsed a packet, remove it from buffer and try again
        this.receiveBuffer = this.receiveBuffer.slice(packetLength);
        bufferWasProcessed = true;
      } else {
        // No entity matched the packet, or checksum failed.
        // Discard one byte from the start of the buffer and try to find the next valid packet.
        this.receiveBuffer = this.receiveBuffer.slice(1);
        bufferWasProcessed = true; // We did modify the buffer
      }
    }
  }

  private handleMqttMessage(topic: string, message: Buffer) {
    if (!this.config || !this.packetProcessor || !this.port) {
      logger.error("[core] Configuration, PacketProcessor or Serial Port not initialized.");
      return;
    }

    logger.debug({ topic, message: message.toString() }, '[core] MQTT 메시지 수신');

    const parts = topic.split('/');
    if (parts.length < 4 || parts[0] !== 'homenet' || parts[2] !== 'set') {
      logger.warn({ topic }, `[core] Unhandled MQTT topic format`);
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
        logger.info({ entity: targetEntity.name, command: commandName, packet: Buffer.from(commandPacket).toString('hex') }, `[core] Sending command packet`);
        this.port.write(Buffer.from(commandPacket));
      } else {
        logger.warn({ entity: targetEntity.name, command: commandName }, `[core] Failed to construct command packet`);
      }
    } else {
      logger.warn({ entityId }, `[core] Entity with ID not found`);
    }
  }
}

export async function createBridge(configPath: string, mqttUrl: string) {
  const bridge = new HomeNetBridge({ configPath, mqttUrl });
  await bridge.start(); // Ensure initialization completes before returning
  return bridge;
}