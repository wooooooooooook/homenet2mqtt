// packages/core/src/transports/matter/behaviors/thermostat-server.ts
//
// Thermostat behavior variants for Matter bridge, adapted from RiDDiX's
// home-assistant-matter-hub implementation.
//
// Key design decisions (from upstream):
// - .set() pre-populates defaults BEFORE Matter.js runs validation during init
// - absMin/absMax setpoint limits are 0..5000 (0~50°C) to avoid constraint errors
// - thermostatPreInitialize runs BEFORE super.initialize() to repair persisted limits
// - this.features.heating/cooling (Matter.js built-in) replaces manual feature flags

import { ThermostatServer as Base } from '@matter/main/behaviors';
import { Thermostat } from '@matter/main/clusters';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';
import { transactionIsOffline } from '../utils/transaction-is-offline.js';
import type { ActionContext } from '@matter/main';

import { ClimateEntity } from '../../../domain/entities/climate.entity.js';

import SystemMode = Thermostat.SystemMode;

// ── Default state values ───────────────────────────────────────────────────
// These MUST be set via .set() when creating the behavior class because
// Matter.js validates setpoints before our initialize() method runs.

const heatingOnlyDefaults = {
  localTemperature: 2100,
  occupiedHeatingSetpoint: 2000,
  minHeatSetpointLimit: 0,
  maxHeatSetpointLimit: 5000,
  absMinHeatSetpointLimit: 0,
  absMaxHeatSetpointLimit: 5000,
};

const coolingOnlyDefaults = {
  localTemperature: 2100,
  occupiedCoolingSetpoint: 2400,
  minCoolSetpointLimit: 0,
  maxCoolSetpointLimit: 5000,
  absMinCoolSetpointLimit: 0,
  absMaxCoolSetpointLimit: 5000,
};

const fullDefaults = {
  ...heatingOnlyDefaults,
  ...coolingOnlyDefaults,
  minSetpointDeadBand: 0,
};

const heatingAndCoolingDefaults = {
  ...heatingOnlyDefaults,
  ...coolingOnlyDefaults,
};

// ── Feature-specific bases ─────────────────────────────────────────────────

const FullFeaturedBase = Base.with('Heating', 'Cooling', 'AutoMode').set(fullDefaults);
const HeatingOnlyFeaturedBase = Base.with('Heating').set(heatingOnlyDefaults);
const CoolingOnlyFeaturedBase = Base.with('Cooling').set(coolingOnlyDefaults);
const HeatingAndCoolingFeaturedBase = Base.with('Heating', 'Cooling').set(
  heatingAndCoolingDefaults,
);

// ── Setpoint limit repair ──────────────────────────────────────────────────
// Persisted storage can hold stale limits from a previous configuration.
// Ensure absMin <= min <= max <= absMax to prevent Matter.js ConstraintError.

interface SetpointLimits {
  absMin: number;
  min: number;
  max: number;
  absMax: number;
}

function repairSetpointLimits(limits: SetpointLimits): SetpointLimits {
  let { min, max } = limits;
  if (min > max) [min, max] = [max, min];
  return {
    min,
    max,
    absMin: Math.min(limits.absMin, min),
    absMax: Math.max(limits.absMax, max),
  };
}

// ── Pre-super initialization ───────────────────────────────────────────────
// Must run BEFORE super.initialize() because Matter.js validates setpoints
// during super. Sets limits with wide range (0~50°C) and repairs persisted state.

function thermostatPreInitialize(self: any): void {
  // Force-set localTemperature
  const currentLocal = self.state.localTemperature;
  self.state.localTemperature =
    typeof currentLocal === 'number' && !Number.isNaN(currentLocal)
      ? currentLocal
      : currentLocal === null
        ? null
        : 2100;

  // Set heating limits and setpoint (only if Heating feature enabled)
  // Order: abs limits → regular limits → setpoints
  if (self.features.heating) {
    self.state.absMinHeatSetpointLimit = self.state.absMinHeatSetpointLimit ?? 0;
    self.state.absMaxHeatSetpointLimit = self.state.absMaxHeatSetpointLimit ?? 5000;
    self.state.minHeatSetpointLimit = self.state.minHeatSetpointLimit ?? 0;
    self.state.maxHeatSetpointLimit = self.state.maxHeatSetpointLimit ?? 5000;

    const heat = repairSetpointLimits({
      absMin: self.state.absMinHeatSetpointLimit,
      min: self.state.minHeatSetpointLimit,
      max: self.state.maxHeatSetpointLimit,
      absMax: self.state.absMaxHeatSetpointLimit,
    });
    self.state.absMinHeatSetpointLimit = heat.absMin;
    self.state.minHeatSetpointLimit = heat.min;
    self.state.maxHeatSetpointLimit = heat.max;
    self.state.absMaxHeatSetpointLimit = heat.absMax;

    const currentHeating = self.state.occupiedHeatingSetpoint;
    self.state.occupiedHeatingSetpoint =
      typeof currentHeating === 'number' && !Number.isNaN(currentHeating) ? currentHeating : 2000;
  }

  // Set cooling limits and setpoint (only if Cooling feature enabled)
  if (self.features.cooling) {
    self.state.absMinCoolSetpointLimit = self.state.absMinCoolSetpointLimit ?? 0;
    self.state.absMaxCoolSetpointLimit = self.state.absMaxCoolSetpointLimit ?? 5000;
    self.state.minCoolSetpointLimit = self.state.minCoolSetpointLimit ?? 0;
    self.state.maxCoolSetpointLimit = self.state.maxCoolSetpointLimit ?? 5000;

    const cool = repairSetpointLimits({
      absMin: self.state.absMinCoolSetpointLimit,
      min: self.state.minCoolSetpointLimit,
      max: self.state.maxCoolSetpointLimit,
      absMax: self.state.absMaxCoolSetpointLimit,
    });
    self.state.absMinCoolSetpointLimit = cool.absMin;
    self.state.minCoolSetpointLimit = cool.min;
    self.state.maxCoolSetpointLimit = cool.max;
    self.state.absMaxCoolSetpointLimit = cool.absMax;

    const currentCooling = self.state.occupiedCoolingSetpoint;
    self.state.occupiedCoolingSetpoint =
      typeof currentCooling === 'number' && !Number.isNaN(currentCooling) ? currentCooling : 2400;
  }

  // minSetpointDeadBand only valid with AutoMode feature
  if (self.features.autoMode) {
    self.state.minSetpointDeadBand = self.state.minSetpointDeadBand ?? 0;
  }

  // Set controlSequenceOfOperation based on features
  self.state.controlSequenceOfOperation =
    self.features.cooling && self.features.heating && self.features.autoMode
      ? Thermostat.ControlSequenceOfOperation.CoolingAndHeating
      : self.features.heating
        ? Thermostat.ControlSequenceOfOperation.HeatingOnly
        : Thermostat.ControlSequenceOfOperation.CoolingOnly;
}

// ── Post-super initialization ──────────────────────────────────────────────
// Must run AFTER super.initialize() because agent/events aren't ready before.

async function thermostatPostInitialize(self: any): Promise<void> {
  const homenet = await self.agent.load(HomenetEntityBehavior);
  updateFromEntityState(self, homenet.entityState);

  // executeCommand와 entityId를 state가 살아있는 시점에 미리 캡처한다.
  // reactTo 콜백은 비동기적으로 실행되므로, 그 시점에는 트랜잭션 컨텍스트
  // (managed proxy)가 이미 만료되어 homenet.state 접근 시 ExpiredReferenceError가
  // 발생한다. 클로저로 직접 참조를 보관하면 이 문제를 회피할 수 있다.
  const executeCommand = homenet.state.executeCommand;
  const entityId = homenet.entityId;

  self.reactTo(self.events.systemMode$Changed, (v: SystemMode, o: SystemMode, c?: ActionContext) =>
    handleSystemModeChanged(executeCommand, entityId, v, o, c),
  );

  if (self.features.heating) {
    self.reactTo(
      self.events.occupiedHeatingSetpoint$Changed,
      (v: number, o: number, c?: ActionContext) =>
        handleSetpointChanged(executeCommand, entityId, v, o, c),
    );
  }
  if (self.features.cooling) {
    self.reactTo(
      self.events.occupiedCoolingSetpoint$Changed,
      (v: number, o: number, c?: ActionContext) =>
        handleSetpointChanged(executeCommand, entityId, v, o, c),
    );
  }

  self.reactTo(homenet.onChange, (state: any) => updateFromEntityState(self, state));
}

// ── Shared update logic ────────────────────────────────────────────────────

function updateFromEntityState(behavior: any, entityState: any): void {
  const currentTemp = entityState?.current_temperature;
  const targetTemp = entityState?.target_temperature;
  const mode = entityState?.mode;

  const config = behavior.agent.get(HomenetEntityBehavior).entityConfig as ClimateEntity;
  const visual = config.visual;

  // Use wide defaults (0~50°C) to avoid constraint violations
  const WIDE_MIN = 0;
  const WIDE_MAX = 5000;
  const minSetpointLimit =
    visual?.min_temperature != null ? visual.min_temperature * 100 : WIDE_MIN;
  const maxSetpointLimit =
    visual?.max_temperature != null ? visual.max_temperature * 100 : WIDE_MAX;

  let systemMode = SystemMode.Off;
  if (mode === 'heat') systemMode = SystemMode.Heat;
  else if (mode === 'cool') systemMode = SystemMode.Cool;
  else if (mode === 'auto') systemMode = SystemMode.Auto;
  else if (mode === 'dry') systemMode = SystemMode.Dry;
  else if (mode === 'fan_only') systemMode = SystemMode.FanOnly;

  // Limits are set FIRST, then setpoints. Order matters because Matter.js
  // validates setpoints against limits during property writes.
  // abs limits are set equal to regular limits to allow the full user range.
  applyPatchState(behavior.state, {
    ...(behavior.features.heating
      ? {
          absMinHeatSetpointLimit: minSetpointLimit,
          absMaxHeatSetpointLimit: maxSetpointLimit,
          minHeatSetpointLimit: minSetpointLimit,
          maxHeatSetpointLimit: maxSetpointLimit,
        }
      : {}),
    ...(behavior.features.cooling
      ? {
          absMinCoolSetpointLimit: minSetpointLimit,
          absMaxCoolSetpointLimit: maxSetpointLimit,
          minCoolSetpointLimit: minSetpointLimit,
          maxCoolSetpointLimit: maxSetpointLimit,
        }
      : {}),
    localTemperature: typeof currentTemp === 'number' ? currentTemp * 100 : null,
    systemMode: systemMode,
  });

  // Setpoints in a separate patch (after limits are applied)
  const setpointValue = typeof targetTemp === 'number' ? targetTemp * 100 : undefined;
  applyPatchState(behavior.state, {
    ...(behavior.features.heating && setpointValue != null
      ? {
          occupiedHeatingSetpoint: Math.max(
            minSetpointLimit,
            Math.min(maxSetpointLimit, setpointValue),
          ),
        }
      : {}),
    ...(behavior.features.cooling && setpointValue != null
      ? {
          occupiedCoolingSetpoint: Math.max(
            minSetpointLimit,
            Math.min(maxSetpointLimit, setpointValue),
          ),
        }
      : {}),
  });
}

async function handleSystemModeChanged(
  executeCommand: HomenetEntityBehavior.State['executeCommand'],
  entityId: string,
  systemMode: SystemMode,
  _oldValue: SystemMode,
  context?: ActionContext,
): Promise<void> {
  if (transactionIsOffline(context)) return;
  let command = 'off';
  if (systemMode === SystemMode.Heat) command = 'heat';
  else if (systemMode === SystemMode.Cool) command = 'cool';
  else if (systemMode === SystemMode.Auto) command = 'auto';
  else if (systemMode === SystemMode.Dry) command = 'dry';
  else if (systemMode === SystemMode.FanOnly) command = 'fan_only';

  await executeCommand(entityId, command);
}

async function handleSetpointChanged(
  executeCommand: HomenetEntityBehavior.State['executeCommand'],
  entityId: string,
  value: number,
  _oldValue: number,
  context?: ActionContext,
): Promise<void> {
  if (transactionIsOffline(context)) return;
  const targetTemp = value / 100;
  await executeCommand(entityId, 'temperature', targetTemp);
}

// ── 1. Full Featured variant (Heating + Cooling + AutoMode) ────────────────

export class ThermostatServer extends FullFeaturedBase {
  override async initialize() {
    thermostatPreInitialize(this);
    await super.initialize();
    await thermostatPostInitialize(this);
  }
}

// ── 2. Heating-only variant ────────────────────────────────────────────────

export class ThermostatServerHeatingOnly extends HeatingOnlyFeaturedBase {
  override async initialize() {
    thermostatPreInitialize(this);
    await super.initialize();
    await thermostatPostInitialize(this);
  }
}

// ── 3. Cooling-only variant ────────────────────────────────────────────────

export class ThermostatServerCoolingOnly extends CoolingOnlyFeaturedBase {
  override async initialize() {
    thermostatPreInitialize(this);
    await super.initialize();
    await thermostatPostInitialize(this);
  }
}

// ── 4. Heating & Cooling variant (no AutoMode) ────────────────────────────

export class ThermostatServerHeatingAndCooling extends HeatingAndCoolingFeaturedBase {
  override async initialize() {
    thermostatPreInitialize(this);
    await super.initialize();
    await thermostatPostInitialize(this);
  }
}

export namespace ThermostatServer {
  export class State extends FullFeaturedBase.State {}
}
export namespace ThermostatServerHeatingOnly {
  export class State extends HeatingOnlyFeaturedBase.State {}
}
export namespace ThermostatServerCoolingOnly {
  export class State extends CoolingOnlyFeaturedBase.State {}
}
export namespace ThermostatServerHeatingAndCooling {
  export class State extends HeatingAndCoolingFeaturedBase.State {}
}
