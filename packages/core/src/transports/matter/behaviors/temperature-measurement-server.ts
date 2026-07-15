// packages/core/src/transports/matter/behaviors/temperature-measurement-server.ts

import { TemperatureMeasurementServer as Base } from '@matter/main/behaviors';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';

export class TemperatureMeasurementServer extends Base {
  override async initialize() {
    await super.initialize();
    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update, { offline: true });
  }

  private update(entityState: any) {
    const rawVal = entityState?.temperature ?? entityState?.state_number ?? entityState?.state;
    const tempNum = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));

    let measuredValue: number | null = null;
    if (!isNaN(tempNum)) {
      const homenet = this.agent.get(HomenetEntityBehavior);
      const config = homenet.entityConfig as any;
      const isFahrenheit = config.unit_of_measurement === '°F' || config.unit === '°F';

      let tempCelsius = tempNum;
      if (isFahrenheit) {
        tempCelsius = ((tempNum - 32) * 5) / 9;
      }
      measuredValue = Math.round(tempCelsius * 100);
    }

    applyPatchState(this.state, {
      measuredValue,
    });
  }
}

export namespace TemperatureMeasurementServer {
  export class State extends Base.State {}
}
