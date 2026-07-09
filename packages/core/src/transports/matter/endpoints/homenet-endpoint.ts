// packages/core/src/transports/matter/endpoints/homenet-endpoint.ts

import { Endpoint } from '@matter/main';
import type { EndpointType } from '@matter/main/node';
import { HomenetEntityBehavior } from '../behaviors/homenet-entity-behavior.js';

export class HomenetEndpoint extends Endpoint {
  readonly entityId: string;

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
        executeCommand,
      },
    } as any);
    this.entityId = entityId;
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
