// packages/core/src/transports/mqtt/mqtt.connector.ts

import mqtt from 'mqtt';
import { IntegrationConnector, ConnectorContext } from '../../service/connector.interface.js';
import { MqttClient } from './mqtt.client.js';
import { MqttPublisher } from './publisher.js';
import { MqttSubscriber } from './subscriber.js';
import { DiscoveryManager } from '../../mqtt/discovery-manager.js';
import { eventBus, StateChangedEvent } from '../../service/event-bus.js';
import { logger } from '../../utils/logger.js';
import { normalizePortId } from '../../utils/port.js';
import { MQTT_TOPIC_PREFIX } from '../../utils/constants.js';
import { ENTITY_TYPE_KEYS } from '../../utils/entities.js';
import { EntityConfig, RestoreMode } from '../../domain/entities/base.entity.js';
import { HomenetBridgeConfig } from '../../config/types.js';

export interface MqttConnectorOptions {
  mqttUrl: string;
  mqttUsername?: string;
  mqttPassword?: string;
  mqttTopicPrefix?: string;
  enableDiscovery?: boolean;
}

export class MqttConnector implements IntegrationConnector {
  readonly name = 'mqtt';
  private context!: ConnectorContext;
  private options: MqttConnectorOptions;

  private _mqttClient!: MqttClient;
  private client!: MqttClient['client'];
  private mqttPublisher!: MqttPublisher;
  private mqttSubscriber!: MqttSubscriber;
  private discoveryManager: DiscoveryManager | null = null;
  private mqttTopicPrefix!: string;
  private isStarted = false;

  constructor(options: MqttConnectorOptions) {
    this.options = options;
  }

  async initialize(context: ConnectorContext): Promise<void> {
    this.context = context;
    const { portId, config } = context;

    const commonMqttTopicPrefix = (this.options.mqttTopicPrefix || MQTT_TOPIC_PREFIX).trim();
    const effectivePortPrefix = (config.serial?.portId || 'homedevice1').toString().trim();
    this.mqttTopicPrefix = `${commonMqttTopicPrefix}/${effectivePortPrefix}`;

    const defaultWillPortId = normalizePortId(config.serial?.portId, 0);
    const willTopic = `${commonMqttTopicPrefix}/${defaultWillPortId}/bridge/status`;

    const mqttOptions: mqtt.IClientOptions = {
      will: {
        topic: willTopic,
        payload: 'offline',
        qos: 1,
        retain: true,
      },
    };

    if (this.options.mqttUsername) {
      mqttOptions.username = this.options.mqttUsername;
    }
    if (this.options.mqttPassword) {
      mqttOptions.password = this.options.mqttPassword;
    }

    this._mqttClient = new MqttClient(this.options.mqttUrl, mqttOptions);
    this.client = this._mqttClient.client;
    this.mqttPublisher = new MqttPublisher(this._mqttClient, this.mqttTopicPrefix, portId);

    const emitMqttStatus = (state: 'connected' | 'connecting' | 'disconnected') => {
      eventBus.emit('mqtt:status', { state, portId });
      eventBus.emit('integration:status', { type: 'mqtt', state, portId });
    };

    this.client.on('connect', () => {
      logger.info({ portId }, '[MqttConnector] MQTT connected');
      emitMqttStatus('connected');
    });
    this.client.on('reconnect', () => {
      logger.warn({ portId }, '[MqttConnector] MQTT reconnecting');
      emitMqttStatus('connecting');
    });
    this.client.on('offline', () => {
      logger.warn({ portId }, '[MqttConnector] MQTT offline');
      emitMqttStatus('connecting');
    });
    this.client.on('close', () => {
      logger.warn({ portId }, '[MqttConnector] MQTT connection closed');
      eventBus.emit('mqtt:disconnected', { portId });
      emitMqttStatus('disconnected');
    });
    this.client.on('error', (error) => {
      const errPayload = {
        message: error.message,
        code: (error as { code?: string }).code,
        portId,
        error,
      };
      eventBus.emit('mqtt:error', errPayload);
      eventBus.emit('integration:error', {
        type: 'mqtt',
        portId,
        message: error.message,
        error,
      });
    });
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    const {
      portId,
      config,
      packetProcessor,
      commandManager,
      automationManager,
      stateProvider,
      stateManager,
    } = this.context;

    this.mqttSubscriber = new MqttSubscriber(
      this._mqttClient,
      portId,
      config,
      packetProcessor,
      commandManager,
      this.mqttTopicPrefix,
      automationManager,
      stateProvider,
    );

    // Set up subscriptions
    if (this._mqttClient.isConnected) {
      this.mqttSubscriber.setupSubscriptions();
    } else {
      this.client.on('connect', () => this.mqttSubscriber.setupSubscriptions());
    }

    // Initialize DiscoveryManager (conditionally based on enableDiscovery option)
    const enableDiscovery = this.options.enableDiscovery !== false;
    if (enableDiscovery) {
      this.discoveryManager = new DiscoveryManager(
        portId,
        config,
        this.mqttPublisher,
        this.mqttSubscriber,
        this.mqttTopicPrefix,
      );
      this.discoveryManager.setup();

      if (this._mqttClient.isConnected) {
        this.discoveryManager.discover();
      } else {
        this.client.on('connect', () => this.discoveryManager!.discover());
      }
    } else {
      logger.info({ portId }, '[MqttConnector] Home Assistant Discovery is disabled');
    }

    // Restore retained states
    await this.restoreRetainedStatesForPort(config, this.mqttTopicPrefix, stateManager);

    eventBus.on('state:changed', this.handleStateChanged);
    eventBus.on('mqtt-publish', this.handleMqttPublish);
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;
    this.isStarted = false;
    eventBus.off('state:changed', this.handleStateChanged);
    eventBus.off('mqtt-publish', this.handleMqttPublish);
    if (this._mqttClient) {
      this._mqttClient.end();
    }
  }

  onStateChanged(event: StateChangedEvent): void {
    if (event.portId !== this.context.portId) return;
    this.mqttPublisher.publish(event.topic, event.payload, { retain: true });
  }

  isConnected(): boolean {
    return this._mqttClient?.isConnected ?? false;
  }

  async clearRetainedMessages(): Promise<number> {
    if (!this._mqttClient || !this._mqttClient.isConnected) {
      throw new Error('MQTT client is not connected');
    }
    // Extract root topic prefix (common topic prefix like 'homenet')
    const rootPrefix = this.mqttTopicPrefix.split('/')[0];
    return this._mqttClient.clearRetainedMessages(rootPrefix);
  }

  async clearRetainedMessagesForEntity(entityId: string): Promise<number> {
    if (!this._mqttClient || !this._mqttClient.isConnected) {
      throw new Error('MQTT client is not connected');
    }
    return this._mqttClient.clearRetainedMessages(`${this.mqttTopicPrefix}/${entityId}`);
  }

  async revokeDevice(entityId: string): Promise<void> {
    this.discoveryManager?.revokeDiscovery(entityId);
  }

  private handleStateChanged = (event: StateChangedEvent) => {
    this.onStateChanged(event);
  };

  private handleMqttPublish = (event: { topic: string; payload: string; retain?: boolean }) => {
    this.mqttPublisher.publish(
      event.topic,
      event.payload,
      event.retain ? { retain: true } : undefined,
    );
  };

  private getRestoreStateEntities(config: HomenetBridgeConfig): EntityConfig[] {
    const entities: EntityConfig[] = [];

    for (const type of ENTITY_TYPE_KEYS) {
      const typedEntities = config[type] as EntityConfig[] | undefined;
      if (!typedEntities) continue;

      for (const entity of typedEntities) {
        const mode: RestoreMode = entity.restore_mode ?? 'ALWAYS_OFF';
        if (entity.id && (mode === 'RESTORE_DEFAULT_ON' || mode === 'RESTORE_DEFAULT_OFF')) {
          entities.push(entity);
        }
      }
    }

    return entities;
  }

  private async restoreRetainedStatesForPort(
    config: HomenetBridgeConfig,
    mqttTopicPrefix: string,
    stateManager: any,
  ) {
    const entities = this.getRestoreStateEntities(config);
    if (entities.length === 0 || !this._mqttClient) return;

    const topicToEntityId = new Map(
      entities.map((entity) => [`${mqttTopicPrefix}/${entity.id}/state`, entity.id]),
    );
    const restoredEntityIds = new Set<string>();

    try {
      const retainedMessages = await this._mqttClient.readRetainedMessages([
        ...topicToEntityId.keys(),
      ]);

      for (const [topic, message] of retainedMessages.entries()) {
        const entityId = topicToEntityId.get(topic);
        if (!entityId) continue;

        try {
          const state = JSON.parse(message.toString()) as unknown;
          if (!state || typeof state !== 'object' || Array.isArray(state)) {
            logger.warn(
              { entityId, topic },
              '[MqttConnector] Ignoring invalid retained state payload',
            );
            continue;
          }

          stateManager.restoreEntityState(entityId, state as Record<string, any>);
          restoredEntityIds.add(entityId);
        } catch (error) {
          logger.warn(
            { err: error, entityId, topic },
            '[MqttConnector] Failed to parse retained state payload',
          );
        }
      }
    } catch (error) {
      logger.warn({ err: error }, '[MqttConnector] Failed to restore retained MQTT states');
    } finally {
      stateManager.initializeRestorableOptimisticDefaults(config);
      logger.info(
        { restored: restoredEntityIds.size, configured: entities.length },
        '[MqttConnector] Retained MQTT state restore completed',
      );
    }
  }
}
