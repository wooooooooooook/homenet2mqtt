// packages/core/src/transports/matter/matter.connector.ts

import { IntegrationConnector, ConnectorContext } from '../../service/connector.interface.js';
import { logger } from '../../utils/logger.js';
import { eventBus, StateChangedEvent } from '../../service/event-bus.js';

export interface MatterConnectorOptions {
  port?: number;
  passcode?: number;
  discriminator?: number;
}

export class MatterConnector implements IntegrationConnector {
  readonly name = 'matter';
  private context!: ConnectorContext;
  private options: MatterConnectorOptions;

  constructor(options: MatterConnectorOptions) {
    this.options = options;
  }

  async initialize(context: ConnectorContext): Promise<void> {
    this.context = context;
    logger.info(
      { portId: context.portId, options: this.options },
      '[MatterConnector] Initializing Matter integration stub...',
    );
    eventBus.emit('integration:status', {
      type: 'matter',
      state: 'connecting',
      portId: context.portId,
    });
  }

  async start(): Promise<void> {
    logger.info(
      { portId: this.context.portId },
      '[MatterConnector] Starting Matter integration stub...',
    );
    eventBus.emit('integration:status', {
      type: 'matter',
      state: 'connected',
      portId: this.context.portId,
    });
  }

  async stop(): Promise<void> {
    logger.info(
      { portId: this.context.portId },
      '[MatterConnector] Stopping Matter integration stub...',
    );
    eventBus.emit('integration:status', {
      type: 'matter',
      state: 'disconnected',
      portId: this.context.portId,
    });
  }

  onStateChanged(event: StateChangedEvent): void {
    logger.debug(
      { entityId: event.entityId, state: event.state },
      '[MatterConnector] State changed event received in stub',
    );
  }

  isConnected(): boolean {
    return true;
  }
}
