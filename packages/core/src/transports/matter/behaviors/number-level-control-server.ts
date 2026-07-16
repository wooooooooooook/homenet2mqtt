// packages/core/src/transports/matter/behaviors/number-level-control-server.ts

import { LevelControlServer as Base } from '@matter/main/behaviors';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';

const FeaturedBase = Base.with('OnOff', 'Lighting');

export class NumberLevelControlServer extends FeaturedBase {
  override async initialize() {
    if (this.state.currentLevel == null) {
      this.state.currentLevel = 0;
    }
    if (this.state.minLevel == null) {
      this.state.minLevel = 0;
    }
    if (this.state.maxLevel == null) {
      this.state.maxLevel = 254;
    }
    this.state.onLevel = null;

    await super.initialize();
    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update, { offline: true });
  }

  private update(entityState: any) {
    const homenet = this.agent.get(HomenetEntityBehavior);
    const config = homenet.entityConfig as any;

    const minVal = config.min_value ?? 0;
    const maxVal = config.max_value ?? 100;

    const rawVal = entityState?.value ?? entityState?.state ?? minVal;
    const value = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));

    const minLevel = 1;
    const maxLevel = 254;

    // Map value to level
    let currentLevel = minLevel;
    if (!isNaN(value)) {
      const percent = (value - minVal) / (maxVal - minVal);
      currentLevel = Math.min(
        maxLevel,
        Math.max(minLevel, Math.round(percent * (maxLevel - minLevel)) + minLevel),
      );
    }

    applyPatchState(this.state, {
      minLevel,
      maxLevel,
      currentLevel,
    });
  }

  override async moveToLevelLogic(level: number) {
    const minLevel = this.state.minLevel ?? 1;
    const maxLevel = this.state.maxLevel ?? 254;

    const homenet = await this.agent.load(HomenetEntityBehavior);
    const config = homenet.entityConfig as any;

    const minVal = config.min_value ?? 0;
    const maxVal = config.max_value ?? 100;

    const percent = (level - minLevel) / (maxLevel - minLevel);
    const targetValue = minVal + percent * (maxVal - minVal);

    // Round according to step
    const step = config.step ?? 1;
    const roundedValue = Math.round(targetValue / step) * step;

    this.state.currentLevel = level;
    await homenet.executeCommand(homenet.entityId, 'number', roundedValue);
  }
}

export namespace NumberLevelControlServer {
  export class State extends FeaturedBase.State {}
}
