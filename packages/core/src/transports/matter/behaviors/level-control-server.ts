// packages/core/src/transports/matter/behaviors/level-control-server.ts

import { LevelControlServer as Base } from '@matter/main/behaviors';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';

const FeaturedBase = Base.with('OnOff', 'Lighting');

export class LevelControlServer extends FeaturedBase {
  override async initialize() {
    await super.initialize();
    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update);
  }

  private update(entityState: any) {
    const brightness = entityState?.brightness; // 0-255
    const minLevel = 1;
    const maxLevel = 254;

    if (typeof brightness === 'number') {
      const percent = brightness / 255;
      const currentLevel = Math.min(
        maxLevel,
        Math.max(minLevel, Math.round(percent * (maxLevel - minLevel)) + minLevel),
      );

      applyPatchState(this.state, {
        minLevel,
        maxLevel,
        currentLevel,
      });
    }
  }

  override async moveToLevelLogic(level: number) {
    const homenet = this.agent.get(HomenetEntityBehavior);
    const minLevel = this.state.minLevel ?? 1;
    const maxLevel = this.state.maxLevel ?? 254;

    const percent = (level - minLevel) / (maxLevel - minLevel);
    const brightness = Math.min(255, Math.max(0, Math.round(percent * 255)));

    await homenet.state.executeCommand(homenet.entityId, 'brightness', brightness);
  }
}
