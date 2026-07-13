// packages/core/src/transports/matter/endpoints/homenet-endpoint.ts

import { Endpoint } from '@matter/main';
import type { EndpointType } from '@matter/main/node';
import { HomenetEntityBehavior } from '../behaviors/homenet-entity-behavior.js';

export class HomenetEndpoint extends Endpoint {
  readonly entityId: string;
  readonly executeCommand: (
    entityId: string,
    commandName: string,
    value?: number | string,
  ) => Promise<{ success: boolean; packet?: string; error?: string }>;

  constructor(
    type: EndpointType,
    entityId: string,
    config: any,
    initialState: any,
    executeCommand: any,
  ) {
    super(type, {
      id: entityId.replace(/\./g, '_'),
      homenetEntity: {
        entityConfig: config,
        entityState: initialState,
      },
    } as any);
    this.entityId = entityId;
    this.executeCommand = executeCommand;
  }

  async updateState(state: Record<string, any>): Promise<void> {
    try {
      await this.construction.ready;
    } catch {
      return;
    }
    const current = this.stateOf(HomenetEntityBehavior).entityState;
    await this.setStateOf(HomenetEntityBehavior, {
      entityState: { ...current, ...state },
    });
  }
}
