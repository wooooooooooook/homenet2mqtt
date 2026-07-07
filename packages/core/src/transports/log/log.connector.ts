// packages/core/src/transports/log/log.connector.ts

import { IntegrationConnector, ConnectorContext } from '../../service/connector.interface.js';
import { logger } from '../../utils/logger.js';
import { eventBus, StateChangedEvent } from '../../service/event-bus.js';

export class LogConnector implements IntegrationConnector {
  readonly name = 'log';
  private context!: ConnectorContext;
  private isStarted = false;

  async initialize(context: ConnectorContext): Promise<void> {
    this.context = context;
    logger.info({ portId: context.portId }, '[LogConnector] Initialized integration log adapter');
    eventBus.emit('integration:status', {
      type: 'log',
      state: 'connecting',
      portId: context.portId,
    });
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    eventBus.on('state:changed', this.handleStateChanged);
    eventBus.on('mqtt-publish', this.handleMqttPublish);

    logger.info({ portId: this.context.portId }, '[LogConnector] Started integration log adapter');
    eventBus.emit('integration:status', {
      type: 'log',
      state: 'connected',
      portId: this.context.portId,
    });
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;
    this.isStarted = false;

    eventBus.off('state:changed', this.handleStateChanged);
    eventBus.off('mqtt-publish', this.handleMqttPublish);

    logger.info({ portId: this.context.portId }, '[LogConnector] Stopped integration log adapter');
    eventBus.emit('integration:status', {
      type: 'log',
      state: 'disconnected',
      portId: this.context.portId,
    });
  }

  onStateChanged(event: StateChangedEvent): void {
    if (event.portId !== this.context.portId) return;
    logger.info(
      {
        entityId: event.entityId,
        portId: event.portId,
        state: event.state,
        changes: event.changes,
      },
      `[LogConnector] State changed: ${event.entityId} -> ${JSON.stringify(event.state)}`,
    );
  }

  isConnected(): boolean {
    return true;
  }

  async clearRetainedMessages(): Promise<number> {
    logger.info('[LogConnector] clearRetainedMessages called (No-op)');
    return 0;
  }

  async clearRetainedMessagesForEntity(entityId: string): Promise<number> {
    logger.info({ entityId }, '[LogConnector] clearRetainedMessagesForEntity called (No-op)');
    return 0;
  }

  private handleStateChanged = (event: StateChangedEvent) => {
    this.onStateChanged(event);
  };

  private handleMqttPublish = (event: { topic: string; payload: string; retain?: boolean }) => {
    logger.info(
      { topic: event.topic, payload: event.payload, retain: event.retain },
      `[LogConnector] Publish payload: ${event.topic} -> ${event.payload}`,
    );
  };
}
