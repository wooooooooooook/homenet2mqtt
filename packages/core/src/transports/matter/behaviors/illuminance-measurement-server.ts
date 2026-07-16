// packages/core/src/transports/matter/behaviors/illuminance-measurement-server.ts

import { IlluminanceMeasurementServer as Base } from '@matter/main/behaviors';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';

export class IlluminanceMeasurementServer extends Base {
  override async initialize() {
    await super.initialize();
    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update, { offline: true });
  }

  private update(entityState: any) {
    const rawVal = entityState?.illuminance ?? entityState?.state_number ?? entityState?.state;
    const lux = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));

    let measuredValue: number | null = null;
    if (!isNaN(lux)) {
      if (lux < 1) {
        measuredValue = 0;
      } else {
        const val = Math.round(10000 * Math.log10(lux) + 1);
        measuredValue = Math.min(0xfffe, Math.max(1, val));
      }
    }

    applyPatchState(this.state, {
      measuredValue,
    });
  }
}

export namespace IlluminanceMeasurementServer {
  export class State extends Base.State {}
}
