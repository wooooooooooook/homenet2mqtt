// packages/core/src/transports/matter/behaviors/on-off-server.ts

import { OnOffServer as Base } from '@matter/main/behaviors';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';

const FeaturedBase = Base.with('Lighting');

export class OnOffServer extends FeaturedBase {
  override async initialize() {
    await super.initialize();
    const homenet = await this.agent.load(HomenetEntityBehavior);
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
    const homenet = await this.agent.load(HomenetEntityBehavior);
    const type = homenet.entityConfig.type ?? '';

    if (type === 'button') {
      applyPatchState(this.state, { onOff: true });
      await homenet.executeCommand(homenet.entityId, 'press');
      // Momentary switch behavior: turn off after a short delay
      setTimeout(() => {
        applyPatchState(this.state, { onOff: false });
      }, 500);
      return;
    }

    // Set onOff immediately so the controller gets instant feedback
    applyPatchState(this.state, { onOff: true });
    const command = type === 'valve' ? 'open' : 'on';
    await homenet.executeCommand(homenet.entityId, command);
  }

  override async off() {
    // Set onOff immediately so the controller gets instant feedback
    applyPatchState(this.state, { onOff: false });
    const homenet = await this.agent.load(HomenetEntityBehavior);
    const command = (homenet.entityConfig.type ?? '') === 'valve' ? 'close' : 'off';
    await homenet.executeCommand(homenet.entityId, command);
  }
}
export namespace OnOffServer {
  export class State extends FeaturedBase.State {}
}
