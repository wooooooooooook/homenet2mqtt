// packages/core/src/transports/matter/behaviors/occupancy-sensing-server.ts

import { OccupancySensingServer as Base } from '@matter/main/behaviors';
import { OccupancySensing } from '@matter/main/clusters';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';

export class OccupancySensingServer extends Base {
  override async initialize() {
    await super.initialize();
    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update, { offline: true });
  }

  private update(entityState: any) {
    const stateVal = entityState?.state;
    // Map ON, DETECTED, OCCUPIED, true or active to occupied: true
    const isOccupied =
      stateVal === 'ON' ||
      stateVal === 'DETECTED' ||
      stateVal === 'OCCUPIED' ||
      stateVal === true ||
      stateVal === 'active';

    applyPatchState(this.state, {
      occupancy: { occupied: isOccupied },
      occupancySensorType: OccupancySensing.OccupancySensorType.PhysicalContact,
      occupancySensorTypeBitmap: {
        pir: false,
        physicalContact: true,
        ultrasonic: false,
      },
    });
  }
}

export namespace OccupancySensingServer {
  export class State extends Base.State {}
}
