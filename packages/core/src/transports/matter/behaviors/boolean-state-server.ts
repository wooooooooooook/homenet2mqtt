// packages/core/src/transports/matter/behaviors/boolean-state-server.ts

import { BooleanStateServer as Base } from '@matter/main/behaviors';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';

export class BooleanStateServer extends Base {
  override async initialize() {
    await super.initialize();
    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update, { offline: true });
  }

  private update(entityState: any) {
    const stateVal = entityState?.state;
    // Map ON, OPEN, DETECTED or true to true, everything else to false
    const isOn =
      stateVal === 'ON' || stateVal === 'OPEN' || stateVal === 'DETECTED' || stateVal === true;
    applyPatchState(this.state, {
      stateValue: isOn,
    });
  }
}

export namespace BooleanStateServer {
  export class State extends Base.State {}
}
