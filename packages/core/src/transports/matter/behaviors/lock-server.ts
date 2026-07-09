// packages/core/src/transports/matter/behaviors/lock-server.ts

import { DoorLockServer as Base } from '@matter/main/behaviors';
import { DoorLock } from '@matter/main/clusters';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';

import LockState = DoorLock.LockState;

export class LockServer extends Base {
  override async initialize() {
    await super.initialize();
    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update);
  }

  private update(entityState: any) {
    const stateVal = entityState?.state;

    let lockState = LockState.Unlocked;
    if (stateVal === 'LOCKED' || stateVal === 'LOCKING') {
      lockState = LockState.Locked;
    } else if (stateVal === 'JAMMED') {
      lockState = LockState.NotFullyLocked;
    }

    applyPatchState(this.state, {
      lockState,
      lockType: DoorLock.LockType.DeadBolt,
      operatingMode: DoorLock.OperatingMode.Normal,
      actuatorEnabled: true,
      supportedOperatingModes: {
        noRemoteLockUnlock: false,
        normal: true,
        passage: false,
        privacy: false,
        vacation: false,
      },
    });
  }

  override async lockDoor() {
    const homenet = this.agent.get(HomenetEntityBehavior);
    await homenet.state.executeCommand(homenet.entityId, 'lock');
  }

  override async unlockDoor() {
    const homenet = this.agent.get(HomenetEntityBehavior);
    await homenet.state.executeCommand(homenet.entityId, 'unlock');
  }
}
export namespace LockServer {
  export class State extends Base.State {}
}
