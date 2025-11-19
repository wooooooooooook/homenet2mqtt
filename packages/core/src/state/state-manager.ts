// packages/core/src/state/state-manager.ts

import { Buffer } from 'buffer';
import { HomenetBridgeConfig } from '../config/types.js';
import { EntityConfig } from '../domain/entities/base.entity.js';
import { PacketProcessor } from '../protocol/packet-processor.js';
import { logger } from '../utils/logger.js';
import { MqttPublisher } from '../transports/mqtt/publisher.js';
import { eventBus } from '../service/event-bus.js';
import { stateCache } from './store.js'; // Import stateCache from store

export class StateManager {
  private receiveBuffer: Buffer = Buffer.alloc(0);
  private config: HomenetBridgeConfig;
  private packetProcessor: PacketProcessor;
  private mqttPublisher: MqttPublisher;

  constructor(config: HomenetBridgeConfig, packetProcessor: PacketProcessor, mqttPublisher: MqttPublisher) {
    this.config = config;
    this.packetProcessor = packetProcessor;
    this.mqttPublisher = mqttPublisher;
  }

  public processIncomingData(chunk: Buffer): void {
    const rawDataHex = chunk.toString('hex');
    logger.debug({ data: rawDataHex }, '[core] Raw data received');
    eventBus.emit('raw-data', rawDataHex);
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);

    const packetDefaults = this.config.packet_defaults;
    if (!packetDefaults || typeof packetDefaults.rx_length === 'undefined') {
      logger.error("[core] 'rx_length' is not defined in packet_defaults.");
      this.receiveBuffer = Buffer.alloc(0);
      return;
    }
    const packetLength = packetDefaults.rx_length;

    logger.debug({ receiveBufferHex: this.receiveBuffer.toString('hex'), currentBufferLength: this.receiveBuffer.length, expectedPacketLength: packetLength }, '[core] Receive buffer state before processing');
    const entityTypes: (keyof HomenetBridgeConfig)[] = [
      'light',
      'climate',
      'valve',
      'button',
      'sensor',
      'fan',
      'switch',
      'binary_sensor',
    ];
    const allEntities: EntityConfig[] = entityTypes
      .map((type) => this.config[type] as EntityConfig[] | undefined)
      .filter((entities): entities is EntityConfig[] => !!entities)
      .flat();

    let bufferWasProcessed = true;
    while (this.receiveBuffer.length >= packetLength && bufferWasProcessed) {
      bufferWasProcessed = false;

      const packet = this.receiveBuffer.slice(0, packetLength);
      logger.debug({ packetHex: packet.toString('hex') }, '[core] Processing packet');
      const parsedStates = this.packetProcessor.parseIncomingPacket(packet.toJSON().data, allEntities);

      if (parsedStates.length > 0) {
        logger.debug({ parsedStates, packetLengthConsumed: packetLength }, '[core] Packet successfully parsed. Consuming full packet.');
        parsedStates.forEach((parsed: { entityId: string; state: any }) => {
          const entity = allEntities.find((e) => e.id === parsed.entityId);
          if (entity) {
            const topic = `homenet/${entity.id}/state`;
            const payload = JSON.stringify(parsed.state);
            if (stateCache.get(topic) !== payload) {
              stateCache.set(topic, payload);
              this.mqttPublisher.publish(topic, payload, { retain: false });
              logger.info({ topic, payload }, '[core] MQTT 발행');
            }
          }
        });
        this.receiveBuffer = this.receiveBuffer.slice(packetLength);
        bufferWasProcessed = true;
      } else {
        logger.debug({ reason: 'No matching entity state or checksum mismatch', byteConsumed: 1 }, '[core] Packet not parsed. Consuming 1 byte.');
        this.receiveBuffer = this.receiveBuffer.slice(1);
        bufferWasProcessed = true;
      }
    }
  }
}
