// packages/core/src/transports/matter/behaviors/on-off-server.ts

import { OnOffServer as Base } from '@matter/main/behaviors';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';

const FeaturedBase = Base.with('Lighting');

export class OnOffServer extends FeaturedBase {
  // initialize 시점에 캡처한 참조 — state managed proxy가 만료된 이후에도
  // executeCommand를 안전하게 호출하기 위해 클로저로 보관한다.
  private _executeCommand!: HomenetEntityBehavior['executeCommand'];
  private _entityId!: string;
  private _entityType!: string;

  override async initialize() {
    await super.initialize();
    const homenet = await this.agent.load(HomenetEntityBehavior);
    this._executeCommand = homenet.executeCommand.bind(homenet);
    this._entityId = homenet.entityId;
    this._entityType = homenet.entityConfig.type ?? '';
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update, { offline: true });
  }

  private update(entityState: any) {
    const stateVal = entityState?.state;
    // For valves, open state is OPEN. For switch/light/fan, it's ON.
    const isOn = stateVal === 'ON' || stateVal === 'OPEN';
    applyPatchState(this.state, {
      onOff: isOn,
    });
  }

  override async on() {
    // Set onOff immediately so the controller gets instant feedback
    applyPatchState(this.state, { onOff: true });
    const command = this._entityType === 'valve' ? 'open' : 'on';
    await this._executeCommand(this._entityId, command);
  }

  override async off() {
    // Set onOff immediately so the controller gets instant feedback
    applyPatchState(this.state, { onOff: false });
    const command = this._entityType === 'valve' ? 'close' : 'off';
    await this._executeCommand(this._entityId, command);
  }
}
export namespace OnOffServer {
  export class State extends FeaturedBase.State {}
}
