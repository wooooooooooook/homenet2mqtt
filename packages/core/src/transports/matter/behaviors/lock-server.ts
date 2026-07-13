// packages/core/src/transports/matter/behaviors/lock-server.ts

import { DoorLockServer as Base } from '@matter/main/behaviors';
import { DoorLock } from '@matter/main/clusters';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';

import LockState = DoorLock.LockState;

export class LockServer extends Base {
  // initialize 시점에 캡처한 참조 — state managed proxy가 만료된 이후에도
  // executeCommand를 안전하게 호출하기 위해 클로저로 보관한다.
  private _executeCommand!: HomenetEntityBehavior.State['executeCommand'];
  private _entityId!: string;

  override async initialize() {
    await super.initialize();
    const homenet = await this.agent.load(HomenetEntityBehavior);
    this._executeCommand = homenet.state.executeCommand;
    this._entityId = homenet.entityId;
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
      // Matter DoorLock bitmap: true = mode NOT supported (inverted semantics)
      supportedOperatingModes: {
        noRemoteLockUnlock: true,
        normal: false, // false = supported
        passage: true,
        privacy: true,
        vacation: true,
        // AlwaysSet (bits 5-15) is mandatory per the Matter spec; matter.js
        // requires supportedOperatingModes.alwaysSet to be 2047.
        alwaysSet: 2047,
      },
    });
  }

  override async lockDoor() {
    // Set lockState immediately for instant UI feedback
    applyPatchState(this.state, { lockState: LockState.Locked });
    await this._executeCommand(this._entityId, 'lock');
  }

  override async unlockDoor() {
    // Set lockState immediately for instant UI feedback
    applyPatchState(this.state, { lockState: LockState.Unlocked });
    await this._executeCommand(this._entityId, 'unlock');
  }
}
export namespace LockServer {
  export class State extends Base.State {}
}
