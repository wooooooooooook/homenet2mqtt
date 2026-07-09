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
    this.reactTo(homenet.onChange, this.update);
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
    const homenet = this.agent.get(HomenetEntityBehavior);
    const type = homenet.entityConfig.type;
    const command = type === 'valve' ? 'open' : 'on';
    await homenet.state.executeCommand(homenet.entityId, command);
  }

  override async off() {
    const homenet = this.agent.get(HomenetEntityBehavior);
    const type = homenet.entityConfig.type;
    const command = type === 'valve' ? 'close' : 'off';
    await homenet.state.executeCommand(homenet.entityId, command);
  }
}
