// packages/core/src/transports/matter/behaviors/humidity-measurement-server.ts

import { RelativeHumidityMeasurementServer as Base } from '@matter/main/behaviors';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';

export class HumidityMeasurementServer extends Base {
  override async initialize() {
    await super.initialize();
    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update, { offline: true });
  }

  private update(entityState: any) {
    const rawVal = entityState?.humidity ?? entityState?.state_number ?? entityState?.state;
    const humNum = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));

    let measuredValue: number | null = null;
    if (!isNaN(humNum)) {
      measuredValue = Math.round(humNum * 100);
    }

    applyPatchState(this.state, {
      measuredValue,
    });
  }
}

export namespace HumidityMeasurementServer {
  export class State extends Base.State {}
}
