// packages/core/src/transports/matter/behaviors/homenet-entity-behavior.ts
// Adapted from home-assistant-matter-hub's HomeAssistantEntityBehavior

import { Behavior, EventEmitter, AsyncObservable } from '@matter/main';
import type { EntityConfig } from '../../../domain/entities/base.entity.js';

/**
 * Core behavior that bridges homenet2mqtt entity state into the Matter Behavior system.
 *
 * Original: HomeAssistantEntityBehavior (HA WebSocket based)
 * Adapted: Uses eventBus state:changed events from RS485/PacketProcessor
 *
 * Each Matter Endpoint includes this behavior, and other cluster-specific
 * behaviors (OnOffServer, ThermostatServer, etc.) react to its state changes.
 */
export class HomenetEntityBehavior extends Behavior {
  static override readonly id = 'homenetEntity';
  declare state: HomenetEntityBehavior.State;
  declare events: HomenetEntityBehavior.Events;

  get entityId(): string {
    return this.state.entityConfig.id;
  }

  get entityConfig(): EntityConfig {
    return this.state.entityConfig;
  }

  get entityState(): Record<string, any> {
    return this.state.entityState;
  }

  get onChange(): HomenetEntityBehavior.Events['entityState$Changed'] {
    return this.events.entityState$Changed;
  }
}

export namespace HomenetEntityBehavior {
  export class State {
    entityConfig!: EntityConfig;
    entityState!: Record<string, any>;
    executeCommand!: (
      entityId: string,
      commandName: string,
      value?: number | string,
    ) => Promise<{ success: boolean; packet?: string; error?: string }>;
  }

  export class Events extends EventEmitter {
    entityState$Changed = AsyncObservable<[Record<string, any>]>();
  }
}
