// packages/core/src/state/state-manager.ts

import { Buffer } from 'buffer';
import { HomenetBridgeConfig } from '../config/types.js';
import { PacketProcessor } from '../protocol/packet-processor.js';
import { logger } from '../utils/logger.js';
import { MqttPublisher } from '../transports/mqtt/publisher.js';
import { eventBus } from '../service/event-bus.js';
import { stateCache } from './store.js';
import { ENTITY_TYPE_KEYS } from '../utils/entities.js';
import { EntityConfig } from '../domain/entities/base.entity.js';
import { RestoreMode } from '../protocol/types.js';

export class StateManager {
  private packetProcessor: PacketProcessor;
  private mqttPublisher: MqttPublisher;
  private portId: string;
  private mqttTopicPrefix: string;
  private ignoredEntityId: string | null = null;
  private sharedStates?: Map<string, Record<string, any>>;
  private internalEntityIds: Set<string>;
  private entities = new Map<string, EntityConfig>();

  constructor(
    portId: string,
    config: HomenetBridgeConfig,
    packetProcessor: PacketProcessor,
    mqttPublisher: MqttPublisher,
    mqttTopicPrefix: string,
    sharedStates?: Map<string, Record<string, any>>,
  ) {
    this.portId = portId;
    this.packetProcessor = packetProcessor;
    this.mqttPublisher = mqttPublisher;
    this.mqttTopicPrefix = mqttTopicPrefix;
    this.sharedStates = sharedStates;

    // Extract internal entity IDs and store entities from config
    this.internalEntityIds = new Set<string>();
    for (const type of ENTITY_TYPE_KEYS) {
      const entities = config[type] as EntityConfig[] | undefined;
      if (entities) {
        for (const entity of entities) {
          if (!entity.id) continue;
          // Store type if missing in a copy to avoid mutating original config significantly
          const entityCopy = { ...entity, type: entity.type || type };
          this.entities.set(entity.id, entityCopy);
          if (entity.internal === true) {
            this.internalEntityIds.add(entity.id);
          }
        }
      }
    }

    // Initialize optimistic entities with default state
    // This ensures they exist in states before any automation guard evaluates them
    this.initializeOptimisticEntities(config);

    if (typeof (this.packetProcessor as any).on === 'function') {
      this.packetProcessor.on('state', (event: { deviceId: string; state: any }) => {
        this.handleStateUpdate(event);
      });
    } else {
      logger.warn(
        '[StateManager] PacketProcessor does not support events; state updates will not be processed automatically',
      );
    }
  }

  public setIgnoreEntity(entityId: string | null) {
    this.ignoredEntityId = entityId;
  }

  public processIncomingData(chunk: Buffer): void {
    // Emit raw data for the service/UI to consume
    // Optimization: avoid string allocation if not needed
    if (logger.isLevelEnabled('trace') || eventBus.listenerCount('raw-data') > 0) {
      const hex = chunk.toString('hex');
      logger.trace({ hex }, '[core] Received chunk');
      eventBus.emit('raw-data', hex);
    }
    this.packetProcessor.processChunk(chunk);
  }

  private getRestoreMode(entity: EntityConfig): RestoreMode {
    if (entity.restore_mode) return entity.restore_mode;
    if (entity.restore_state === true) return 'RESTORE_DEFAULT_OFF';
    return 'DISABLED';
  }

  private invertState(state: Record<string, any>): Record<string, any> {
    const newState = { ...state };
    if (typeof newState.state !== 'string') return newState;

    const inversions: Record<string, string> = {
      ON: 'OFF',
      OFF: 'ON',
      OPEN: 'CLOSED',
      CLOSED: 'OPEN',
      LOCKED: 'UNLOCKED',
      UNLOCKED: 'LOCKED',
    };

    if (inversions[newState.state]) {
      newState.state = inversions[newState.state];
    }

    return newState;
  }

  /**
   * Initialize optimistic entities with default states.
   * This ensures they exist in deviceStates/sharedStates before any automation guard evaluates them.
   */
  private getOptimisticState(entityType: string, on: boolean): Record<string, any> | null {
    const offStateByType: Record<string, Record<string, any>> = {
      binary_sensor: { state: 'OFF' },
      switch: { state: 'OFF' },
      light: { state: 'OFF' },
      valve: { state: 'CLOSED' },
      cover: { state: 'CLOSED' },
      fan: { state: 'OFF' },
      lock: { state: 'LOCKED' },
      button: {}, // Buttons don't have persistent state
      sensor: {}, // Sensors need actual values, skip
      climate: {}, // Climate has complex state, skip
      text: {}, // Text needs initial_value, handled by TextDevice
    };

    const onStateByType: Record<string, Record<string, any>> = {
      binary_sensor: { state: 'ON' },
      switch: { state: 'ON' },
      light: { state: 'ON' },
      valve: { state: 'OPEN' },
      cover: { state: 'OPEN' },
      fan: { state: 'ON' },
      lock: { state: 'UNLOCKED' },
    };

    const defaultState = on ? onStateByType[entityType] : offStateByType[entityType];
    if (!defaultState || Object.keys(defaultState).length === 0) {
      return null;
    }

    return { ...defaultState };
  }

  /**
   * Initialize optimistic entities with default states.
   * This ensures they exist in deviceStates/sharedStates before any automation guard evaluates them.
   */
  private initializeOptimisticEntities(config: HomenetBridgeConfig): void {
    this.initializeOptimisticDefaults(config, false);
  }

  public initializeRestorableOptimisticDefaults(config: HomenetBridgeConfig): void {
    this.initializeOptimisticDefaults(config, true);
  }

  private initializeOptimisticDefaults(config: HomenetBridgeConfig, onlyRestorable: boolean): void {
    for (const type of ENTITY_TYPE_KEYS) {
      const entities = config[type] as EntityConfig[] | undefined;
      if (!entities) {
        continue;
      }

      for (const entity of entities) {
        if (!entity.optimistic || !entity.id) continue;

        const mode = this.getRestoreMode(entity);
        if (mode === 'DISABLED') continue;

        const isRestoreType = mode.startsWith('RESTORE_');
        if (onlyRestorable !== isRestoreType) continue;

        const entityType = entity.type || type;

        // Phase 1: ALWAYS_OFF, ALWAYS_ON
        if (!onlyRestorable) {
          if (mode === 'ALWAYS_OFF' || mode === 'ALWAYS_ON') {
            const state = this.getOptimisticState(entityType, mode === 'ALWAYS_ON');
            if (state && !this.deviceStates.has(entity.id)) {
              this.applyStateUpdate(entity.id, state);
              logger.debug(
                `[StateManager] Initialized entity ${entity.id} with ALWAYS mode state: ${JSON.stringify(state)}`,
              );
            }
          }
          continue;
        }

        // Phase 2: RESTORE_* defaults (if not already restored from MQTT)
        if (!this.deviceStates.has(entity.id)) {
          const useOnDefault = mode.endsWith('_ON');
          const state = this.getOptimisticState(entityType, useOnDefault);
          if (state) {
            this.applyStateUpdate(entity.id, state);
            logger.debug(
              `[StateManager] Initialized restorable entity ${entity.id} with default state: ${JSON.stringify(state)}`,
            );
          }
        }
      }
    }
  }

  private deviceStates = new Map<string, any>();

  public restoreEntityState(entityId: string, state: Record<string, any>): void {
    const entity = this.entities.get(entityId);
    let finalState = state;

    if (entity) {
      const mode = this.getRestoreMode(entity);
      if (mode.startsWith('RESTORE_INVERTED_')) {
        finalState = this.invertState(state);
        logger.info({ entityId }, '[StateManager] Inverting restored state per restore_mode');
      }
    }

    this.deviceStates.set(entityId, { ...finalState });
    this.cachedStates = null;

    if (this.sharedStates) {
      this.sharedStates.set(entityId, { ...finalState });
    }

    const topic = `${this.mqttTopicPrefix}/${entityId}/state`;
    stateCache.set(topic, JSON.stringify(finalState));

    logger.info({ entityId, topic }, '[StateManager] Restored entity state from MQTT retained');
  }

  public getLightState(entityId: string): { isOn: boolean } | undefined {
    const state = this.deviceStates.get(entityId);
    if (state && typeof state.isOn === 'boolean') {
      return { isOn: state.isOn };
    }
    return undefined;
  }

  public getClimateState(entityId: string): { targetTemperature: number } | undefined {
    const state = this.deviceStates.get(entityId);
    if (state && typeof state.targetTemperature === 'number') {
      return { targetTemperature: state.targetTemperature };
    }
    return undefined;
  }

  private cachedStates: Record<string, any> | null = null;

  public getAllStates(): Record<string, any> {
    if (this.cachedStates) {
      return this.cachedStates;
    }
    this.cachedStates = Object.fromEntries(this.deviceStates);
    return this.cachedStates;
  }

  public getEntityState(entityId: string): any {
    return this.deviceStates.get(entityId);
  }

  public updateEntityState(entityId: string, state: Record<string, any>) {
    this.applyStateUpdate(entityId, state);
  }

  private handleStateUpdate(event: { deviceId: string; state: any }) {
    const { deviceId, state } = event;
    this.applyStateUpdate(deviceId, state);
  }

  private applyStateUpdate(deviceId: string, state: Record<string, any>) {
    if (this.ignoredEntityId && deviceId === this.ignoredEntityId) {
      return;
    }

    const currentState = this.deviceStates.get(deviceId) || {};

    // Optimization: Check if state actually changed
    // Most updates are redundant (repeating the same values).
    // We do a shallow comparison of primitives to avoid expensive object creation and JSON.stringify.
    let hasChanges = false;
    for (const key in state) {
      if (currentState[key] !== state[key]) {
        hasChanges = true;
        break;
      }
    }

    // If no changes detected and we already have state, skip processing
    if (!hasChanges && Object.keys(currentState).length > 0) {
      if (logger.isLevelEnabled('trace')) {
        logger.trace(`[StateManager] ${deviceId}: [unchanged]`);
      }
      return;
    }

    const newState = { ...currentState, ...state };
    this.deviceStates.set(deviceId, newState);
    this.cachedStates = null; // Invalidate cache

    // Update shared global state if available
    if (this.sharedStates) {
      this.sharedStates.set(deviceId, newState);
    }

    const topic = `${this.mqttTopicPrefix}/${deviceId}/state`;
    const payload = JSON.stringify(newState);

    // Double check with cache (handles reference types like arrays that always fail strict equality)
    if (stateCache.get(topic) !== payload) {
      stateCache.set(topic, payload);

      // Skip MQTT publish and event emission for internal entities
      // Internal state is still stored in deviceStates/sharedStates for automation use
      if (this.internalEntityIds.has(deviceId)) {
        if (logger.isLevelEnabled('debug')) {
          logger.debug(`[StateManager] ${deviceId}: [internal, skipping publish]`);
        }
        return;
      }

      if (logger.isLevelEnabled('info')) {
        const stateStr = payload.replace(/["{}]/g, '').replace(/,/g, ', ');
        logger.info(`[StateManager] ${deviceId}: {${stateStr}} → ${topic} [published]`);
      }
      this.mqttPublisher.publish(topic, payload, { retain: true });
      const timestamp = new Date().toISOString();
      eventBus.emit('state:changed', {
        portId: this.portId,
        entityId: deviceId,
        topic,
        payload,
        state: newState,
        oldState: currentState,
        changes: state,
        timestamp,
      });
      eventBus.emit(`device:${deviceId}:state:changed`, newState);
    } else {
      if (logger.isLevelEnabled('trace')) {
        const stateStr = payload.replace(/["{}]/g, '').replace(/,/g, ', ');
        logger.trace(`[StateManager] ${deviceId}: {${stateStr}} [unchanged]`);
      }
    }
  }
}
