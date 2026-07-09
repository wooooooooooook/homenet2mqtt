// packages/core/src/transports/matter/matter.connector.ts

import { Environment, StorageService } from '@matter/main';
import { StorageBackendDisk } from '@matter/nodejs';
import path from 'node:path';
import fs from 'node:fs';

import { IntegrationConnector, ConnectorContext } from '../../service/connector.interface.js';
import { logger } from '../../utils/logger.js';
import { eventBus, StateChangedEvent } from '../../service/event-bus.js';
import { AggregatorEndpoint } from './endpoints/aggregator-endpoint.js';
import { BridgeServerNode } from './endpoints/bridge-server-node.js';
import { HomenetEndpoint } from './endpoints/homenet-endpoint.js';
import { createEndpointType } from './endpoints/device-type-factory.js';
import { ENTITY_TYPE_KEYS } from '../../utils/entities.js';
import type { EntityConfig } from '../../domain/entities/base.entity.js';

export interface MatterConnectorOptions {
  port?: number;
  passcode?: number;
  discriminator?: number;
  vendorId?: number;
  productId?: number;
  productName?: string;
  storagePath?: string;
}

export class MatterConnector implements IntegrationConnector {
  readonly name = 'matter';
  private context!: ConnectorContext;
  private options: MatterConnectorOptions;

  private env!: Environment;
  private serverNode!: BridgeServerNode;
  private aggregator!: AggregatorEndpoint;
  private endpoints = new Map<string, HomenetEndpoint>();
  private isStarted = false;

  constructor(options: MatterConnectorOptions) {
    this.options = options;
  }

  async initialize(context: ConnectorContext): Promise<void> {
    this.context = context;
    const { portId, config } = context;

    logger.info(
      { portId, options: this.options },
      '[MatterConnector] Initializing Matter integration...',
    );

    eventBus.emit('integration:status', {
      type: 'matter',
      state: 'connecting',
      portId,
    });

    // 1. Initialize Matter Environment
    this.env = new Environment(`homenet-matter-${portId}`);

    // Set storage location and backend
    const storagePath = this.options.storagePath
      ? path.resolve(this.options.storagePath)
      : path.join(process.cwd(), '.matter-storage');

    fs.mkdirSync(storagePath, { recursive: true });

    const storageService = this.env.get(StorageService);
    storageService.location = storagePath;
    storageService.factory = (namespace) =>
      new StorageBackendDisk(path.resolve(storagePath, namespace));

    // 2. Initialize Aggregator (acts as the bridge hub)
    this.aggregator = new AggregatorEndpoint('aggregator');

    // 3. Instantiate ServerNode first (so aggregator is installed in a Node)
    this.serverNode = new BridgeServerNode(
      this.env,
      {
        id: `homenet_${portId}`,
        name: `Homenet Bridge ${portId}`,
        port: this.options.port,
        passcode: this.options.passcode,
        discriminator: this.options.discriminator,
        vendorId: this.options.vendorId,
        productId: this.options.productId,
        productName: this.options.productName,
      },
      this.aggregator,
    );

    // 4. Find, register and add all supported entities to the aggregator
    const executeCmd = (entityId: string, cmd: string, val?: number | string) =>
      this.context.executeCommand(entityId, cmd, val);

    for (const type of ENTITY_TYPE_KEYS) {
      const list = config[type] as EntityConfig[] | undefined;
      if (!list || !Array.isArray(list)) continue;

      for (const entity of list) {
        if (!entity.id || entity.internal) continue;

        const endpointType = createEndpointType(type, entity);
        if (!endpointType) {
          logger.debug(
            { entityId: entity.id, type },
            '[MatterConnector] Unsupported device type for Matter mapping',
          );
          continue;
        }

        const initialState = this.context.stateManager.getEntityState(entity.id) || {};
        const endpoint = new HomenetEndpoint(
          endpointType,
          entity.id,
          entity,
          initialState,
          executeCmd,
        );

        this.endpoints.set(entity.id, endpoint);
        await this.aggregator.add(endpoint);
        logger.info({ entityId: entity.id, type }, '[MatterConnector] Registered Matter endpoint');
      }
    }
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    logger.info({ portId: this.context.portId }, '[MatterConnector] Starting Matter ServerNode...');

    await this.serverNode.start();

    const commissioning = this.serverNode.state.commissioning;
    logger.info(
      {
        portId: this.context.portId,
        passcode: commissioning.passcode,
        discriminator: commissioning.discriminator,
        manualPairingCode: commissioning.pairingCodes.manualPairingCode,
        qrPairingCode: commissioning.pairingCodes.qrPairingCode,
      },
      `[MatterConnector] Matter bridge started. Commissioning Info:
       Passcode: ${commissioning.passcode}
       Discriminator: ${commissioning.discriminator}
       Manual Pairing Code: ${commissioning.pairingCodes.manualPairingCode}
       QR Code Setup URI: ${commissioning.pairingCodes.qrPairingCode}`,
    );

    eventBus.emit('integration:status', {
      type: 'matter',
      state: 'connected',
      portId: this.context.portId,
    });

    eventBus.on('state:changed', this.handleStateChanged);
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;
    this.isStarted = false;

    logger.info({ portId: this.context.portId }, '[MatterConnector] Stopping Matter ServerNode...');

    eventBus.off('state:changed', this.handleStateChanged);
    await this.serverNode.cancel();

    eventBus.emit('integration:status', {
      type: 'matter',
      state: 'disconnected',
      portId: this.context.portId,
    });
  }

  onStateChanged(event: StateChangedEvent): void {
    if (event.portId !== this.context.portId) return;
    const endpoint = this.endpoints.get(event.entityId);
    if (endpoint) {
      void endpoint.updateState(event.state);
    }
  }

  isConnected(): boolean {
    return this.isStarted;
  }

  getCommissioningInfo() {
    if (!this.serverNode) return null;
    const comm = this.serverNode.state.commissioning;
    return {
      isCommissioned: comm.commissioned,
      passcode: comm.passcode,
      discriminator: comm.discriminator,
      manualPairingCode: comm.pairingCodes.manualPairingCode,
      qrPairingCode: comm.pairingCodes.qrPairingCode,
    };
  }

  private handleStateChanged = (event: StateChangedEvent) => {
    this.onStateChanged(event);
  };
}
