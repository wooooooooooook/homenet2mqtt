// packages/core/src/transports/matter/matter.connector.ts

import { Environment, StorageService } from '@matter/main';
import '@matter/nodejs';
import { StorageBackendDisk } from '@matter/nodejs';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';

import { IntegrationConnector, ConnectorContext } from '../../service/connector.interface.js';
import { logger } from '../../utils/logger.js';
import { eventBus, StateChangedEvent } from '../../service/event-bus.js';
import { AggregatorEndpoint } from './endpoints/aggregator-endpoint.js';
import { BridgeServerNode } from './endpoints/bridge-server-node.js';
import { HomenetEndpoint } from './endpoints/homenet-endpoint.js';
import { createEndpointType } from './endpoints/device-type-factory.js';
import { OnOffServer } from './behaviors/on-off-server.js';
import { LevelControlServer } from './behaviors/level-control-server.js';
import {
  ThermostatServer,
  ThermostatServerHeatingOnly,
  ThermostatServerCoolingOnly,
  ThermostatServerHeatingAndCooling,
} from './behaviors/thermostat-server.js';
import { LockServer } from './behaviors/lock-server.js';
import { BooleanStateServer } from './behaviors/boolean-state-server.js';
import { OccupancySensingServer } from './behaviors/occupancy-sensing-server.js';
import { TemperatureMeasurementServer } from './behaviors/temperature-measurement-server.js';
import { HumidityMeasurementServer } from './behaviors/humidity-measurement-server.js';
import { IlluminanceMeasurementServer } from './behaviors/illuminance-measurement-server.js';
import { FanControlServer } from './behaviors/fan-control-server.js';
import { NumberLevelControlServer } from './behaviors/number-level-control-server.js';
import { SelectModeServer } from './behaviors/select-mode-server.js';
import { BasicInformationServer } from './behaviors/basic-information-server.js';
import { ENTITY_TYPE_KEYS, findEntityById } from '../../utils/entities.js';
import type { EntityConfig } from '../../domain/entities/base.entity.js';

export interface MatterConnectorOptions {
  port?: number;
  passcode?: number;
  discriminator?: number;
  vendorId?: number;
  productId?: number;
  productName?: string;
  configDir: string;
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

    // 0. Resolve port collision dynamically
    const startPort = this.options.port || 5540;
    const startDiscriminator = this.options.discriminator;

    let finalPort = startPort;
    let finalDiscriminator = startDiscriminator;

    try {
      finalPort = await findAvailablePort(startPort);
      const portOffset = finalPort - startPort;
      if (startDiscriminator !== undefined) {
        finalDiscriminator = startDiscriminator + portOffset;
      }
      if (portOffset > 0) {
        logger.warn(
          {
            originalPort: startPort,
            allocatedPort: finalPort,
            discriminator: finalDiscriminator ?? 'auto',
          },
          `[MatterConnector] Port ${startPort} was occupied. Automatically allocated port ${finalPort} and discriminator ${finalDiscriminator ?? 'auto'}`,
        );
      }
    } catch (err) {
      logger.error(
        { err },
        '[MatterConnector] Failed to find available port, falling back to configured port.',
      );
    }

    // 1. Initialize Matter Environment
    this.env = new Environment(`homenet-matter-${portId}`, Environment.default);

    // Set storage location and backend (always saved under configDir/.matter-storage)
    const storagePath = path.join(this.options.configDir, '.matter-storage');
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
        port: finalPort,
        passcode: this.options.passcode,
        discriminator: finalDiscriminator,
        vendorId: this.options.vendorId,
        productId: this.options.productId,
        productName: this.options.productName,
      },
      this.aggregator,
    );

    // Wait for the server node and aggregator construction to be fully ready.
    // The aggregator must be installed in the Node before add() can be called.
    await this.serverNode.construction.ready;
    await this.aggregator.construction.ready;

    // 4. Find, register and add all supported entities to the aggregator
    const executeCmd = (entityId: string, cmd: string, val?: number | string) => {
      const entity = findEntityById(config, entityId);
      const entityType = entity?.type || '';

      eventBus.emit('interface-log:added', {
        timestamp: new Date().toISOString(),
        integration: 'matter',
        direction: 'in',
        topicOrEntityId: entityId,
        payload: JSON.stringify(getMatterCommandPayload(entityType, cmd, val)),
        portId,
      });
      return this.context.executeCommand(entityId, cmd, val);
    };

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

        try {
          await this.aggregator.add(endpoint);
          await endpoint.construction.ready;
          this.endpoints.set(entity.id, endpoint);
          logger.info(
            { entityId: entity.id, type },
            '[MatterConnector] Registered Matter endpoint',
          );
        } catch (err) {
          logger.error(
            { entityId: entity.id, type, err },
            `[MatterConnector] Failed to initialize Matter endpoint for ${entity.id}. Skipping this device.`,
          );
          try {
            this.aggregator.parts.delete(endpoint);
          } catch (deleteErr) {
            logger.debug(
              { deleteErr },
              `[MatterConnector] Error removing failed endpoint ${entity.id} from aggregator`,
            );
          }
          this.endpoints.delete(entity.id);
        }
      }
    }
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;

    logger.info({ portId: this.context.portId }, '[MatterConnector] Starting Matter ServerNode...');

    let attempts = 0;
    const maxAttempts = 10;
    let currentPort = this.serverNode.state.network.port;
    let currentDiscriminator = this.serverNode.state.commissioning.discriminator;

    while (attempts < maxAttempts) {
      try {
        await this.serverNode.start();
        this.options.port = currentPort;
        this.options.discriminator = currentDiscriminator;
        break;
      } catch (err: any) {
        attempts++;
        const errMessage = err?.message || '';
        const errCode = err?.code;
        const isAddrInUse =
          errCode === 'EADDRINUSE' ||
          errMessage.includes('EADDRINUSE') ||
          errMessage.includes('Address already in use') ||
          (err?.cause &&
            (err.cause.code === 'EADDRINUSE' || String(err.cause.message).includes('EADDRINUSE')));

        if (!isAddrInUse || attempts >= maxAttempts) {
          logger.error(
            { err, port: currentPort },
            `[MatterConnector] Failed to start Matter ServerNode after attempt ${attempts}`,
          );
          this.isStarted = false;
          throw err;
        }

        try {
          await this.serverNode.cancel();
        } catch (cancelErr) {
          logger.debug({ cancelErr }, '[MatterConnector] Error canceling failed serverNode');
        }

        const startPort = currentPort + 1;
        let nextPort = startPort;
        try {
          nextPort = await findAvailablePort(startPort);
        } catch (portErr) {
          nextPort = startPort;
        }

        const portOffset = nextPort - currentPort;
        const nextDiscriminator =
          currentDiscriminator !== undefined ? currentDiscriminator + portOffset : undefined;

        logger.warn(
          { port: currentPort, nextPort, nextDiscriminator, attempt: attempts },
          `[MatterConnector] Port ${currentPort} is already in use. Automatically re-allocated to port ${nextPort} and discriminator ${nextDiscriminator ?? 'auto'} (attempt ${attempts}/${maxAttempts})`,
        );

        currentPort = nextPort;
        if (nextDiscriminator !== undefined) {
          currentDiscriminator = nextDiscriminator;
        }

        this.serverNode = new BridgeServerNode(
          this.env,
          {
            id: `homenet_${this.context.portId}`,
            name: `Homenet Bridge ${this.context.portId}`,
            port: currentPort,
            passcode: this.options.passcode,
            discriminator: currentDiscriminator,
            vendorId: this.options.vendorId,
            productId: this.options.productId,
            productName: this.options.productName,
          },
          this.aggregator,
        );

        await this.serverNode.construction.ready;
      }
    }

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
      eventBus.emit('interface-log:added', {
        timestamp: new Date().toISOString(),
        integration: 'matter',
        direction: 'out',
        topicOrEntityId: event.entityId,
        payload: JSON.stringify(event.state),
        portId: this.context.portId,
      });
      void endpoint.updateState(event.state);
    }
  }

  isConnected(): boolean {
    return this.isStarted;
  }

  getMatterDeviceState(entityId: string): Record<string, any> | null {
    const endpoint = this.endpoints.get(entityId);
    if (!endpoint) return null;

    const stateObj: Record<string, any> = {};

    const behaviorsToQuery = [
      { name: 'onOff', behavior: OnOffServer },
      { name: 'levelControl', behavior: LevelControlServer },
      { name: 'thermostat', behavior: ThermostatServer },
      { name: 'thermostatHeatingOnly', behavior: ThermostatServerHeatingOnly },
      { name: 'thermostatCoolingOnly', behavior: ThermostatServerCoolingOnly },
      { name: 'thermostatHeatingAndCooling', behavior: ThermostatServerHeatingAndCooling },
      { name: 'doorLock', behavior: LockServer },
      { name: 'booleanState', behavior: BooleanStateServer },
      { name: 'occupancySensing', behavior: OccupancySensingServer },
      { name: 'temperatureMeasurement', behavior: TemperatureMeasurementServer },
      { name: 'humidityMeasurement', behavior: HumidityMeasurementServer },
      { name: 'illuminanceMeasurement', behavior: IlluminanceMeasurementServer },
      { name: 'fanControl', behavior: FanControlServer },
      { name: 'numberLevelControl', behavior: NumberLevelControlServer },
      { name: 'selectMode', behavior: SelectModeServer },
      { name: 'basicInformation', behavior: BasicInformationServer },
    ];

    for (const item of behaviorsToQuery) {
      try {
        const state = endpoint.stateOf(item.behavior);
        if (state) {
          const keyName = item.name.startsWith('thermostat') ? 'thermostat' : item.name;
          stateObj[keyName] = { ...stateObj[keyName], ...JSON.parse(JSON.stringify(state)) };
        }
      } catch (err) {
        // Ignored if behavior is not active or fails to query
      }
    }

    return stateObj;
  }

  getCommissioningInfo() {
    if (!this.serverNode) return null;
    const comm = this.serverNode.state.commissioning;
    const opCreds = this.serverNode.state.operationalCredentials;

    const fabrics = (opCreds?.fabrics ?? []).map((f: any) => {
      let label = f.label;
      if (!label || label === 'Platform' || label === 'platform') {
        label = PLATFORM_LABELS[f.vendorId] || 'Platform';
      }
      return {
        fabricIndex: f.fabricIndex,
        fabricId: f.fabricId?.toString(),
        nodeId: f.nodeId?.toString(),
        vendorId: f.vendorId,
        label,
      };
    });

    return {
      isCommissioned: comm.commissioned,
      passcode: comm.passcode,
      discriminator: comm.discriminator,
      manualPairingCode: comm.pairingCodes.manualPairingCode,
      qrPairingCode: comm.pairingCodes.qrPairingCode,
      fabrics,
      deviceCount: this.endpoints.size,
      productName: this.options.productName || `Homenet Bridge ${this.context.portId}`,
    };
  }

  private handleStateChanged = (event: StateChangedEvent) => {
    this.onStateChanged(event);
  };
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(startPort: number, maxAttempts = 100): Promise<number> {
  let port = startPort;
  for (let i = 0; i < maxAttempts; i++) {
    if (await isPortAvailable(port)) {
      return port;
    }
    logger.warn(`[MatterConnector] Port ${port} is already in use, trying next port...`);
    port++;
  }
  throw new Error(`Could not find an available port starting from ${startPort}`);
}

const PLATFORM_LABELS: Record<number, string> = {
  0x1111: 'Google Home',
  0x6006: 'Google Home',
  0x130b: 'Apple Home',
  0x1349: 'Apple Home',
  0x1384: 'Apple Home',
  0x110a: 'Samsung SmartThings',
  0x10e1: 'Samsung SmartThings',
  0x1211: 'Amazon Alexa',
  0x1217: 'Amazon Alexa',
  0x120f: 'Home Assistant',
  0xfff1: 'Test Platform',
};

function getMatterCommandPayload(
  entityType: string,
  cmd: string,
  val?: number | string,
): Record<string, any> {
  const lowerCmd = cmd.toLowerCase();
  const lowerType = entityType.toLowerCase();

  if (
    lowerType === 'switch' ||
    lowerType === 'light' ||
    lowerType === 'outlet' ||
    lowerType === 'button'
  ) {
    if (lowerCmd === 'on' || lowerCmd === 'off') {
      return { cluster: 'OnOff', command: cmd.toUpperCase() };
    }
    if (lowerCmd === 'press') {
      return { cluster: 'OnOff', command: 'Press' };
    }
    if (lowerCmd === 'brightness') {
      return { cluster: 'LevelControl', attribute: 'CurrentLevel', value: val };
    }
  }

  if (lowerType === 'valve') {
    if (lowerCmd === 'open' || lowerCmd === 'close') {
      return { cluster: 'OnOff', command: cmd === 'open' ? 'On (Open)' : 'Off (Close)' };
    }
  }

  if (lowerType === 'fan') {
    if (lowerCmd === 'off') {
      return { cluster: 'FanControl', command: 'TurnOff' };
    }
    if (lowerCmd === 'percentage') {
      return { cluster: 'FanControl', attribute: 'PercentSetting', value: val };
    }
    if (lowerCmd === 'speed') {
      return { cluster: 'FanControl', attribute: 'SpeedSetting', value: val };
    }
  }

  if (lowerType === 'lock') {
    if (lowerCmd === 'lock' || lowerCmd === 'unlock') {
      return { cluster: 'DoorLock', command: cmd === 'lock' ? 'LockDoor' : 'UnlockDoor' };
    }
  }

  if (lowerType === 'climate') {
    if (lowerCmd === 'temperature') {
      return { cluster: 'Thermostat', attribute: 'OccupiedHeatingSetpoint', value: val };
    }
    if (
      lowerCmd === 'heat' ||
      lowerCmd === 'cool' ||
      lowerCmd === 'auto' ||
      lowerCmd === 'off' ||
      lowerCmd === 'dry' ||
      lowerCmd === 'fan_only'
    ) {
      return { cluster: 'Thermostat', attribute: 'SystemMode', value: cmd };
    }
  }

  if (lowerType === 'select') {
    if (lowerCmd === 'select') {
      return { cluster: 'ModeSelect', command: 'ChangeToMode', value: val };
    }
  }

  if (lowerType === 'number') {
    if (lowerCmd === 'number') {
      return { cluster: 'LevelControl', command: 'MoveToLevel', value: val };
    }
  }

  return { command: cmd, value: val };
}
