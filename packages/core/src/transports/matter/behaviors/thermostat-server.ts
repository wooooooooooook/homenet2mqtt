// packages/core/src/transports/matter/behaviors/thermostat-server.ts

import { ThermostatServer as Base } from '@matter/main/behaviors';
import { Thermostat } from '@matter/main/clusters';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';
import { transactionIsOffline } from '../utils/transaction-is-offline.js';
import type { ActionContext } from '@matter/main';

import { ClimateEntity } from '../../../domain/entities/climate.entity.js';

import SystemMode = Thermostat.SystemMode;

// Helper to copy prototype methods from source class to target class (from RiDDiX implementation)
function copyPrototype(source: any, target: any) {
  for (const name of Object.getOwnPropertyNames(source.prototype)) {
    if (name === 'constructor' || name === 'initialize') continue;
    const desc = Object.getOwnPropertyDescriptor(source.prototype, name);
    if (desc) {
      Object.defineProperty(target.prototype, name, desc);
    }
  }
}

// 1. Full Featured variant
const FullFeaturedBase = Base.with('Heating', 'Cooling', 'AutoMode');
export class ThermostatServer extends FullFeaturedBase {
  override async initialize() {
    this.state.controlSequenceOfOperation = Thermostat.ControlSequenceOfOperation.CoolingAndHeating;
    await super.initialize();

    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update);

    this.reactTo(this.events.systemMode$Changed, this.systemModeChanged);
    this.reactTo(this.events.occupiedHeatingSetpoint$Changed, this.heatingSetpointChanged);
    this.reactTo(this.events.occupiedCoolingSetpoint$Changed, this.coolingSetpointChanged);
  }

  private update(entityState: any) {
    const currentTemp = entityState?.current_temperature;
    const targetTemp = entityState?.target_temperature;
    const mode = entityState?.mode;

    const config = this.agent.get(HomenetEntityBehavior).entityConfig as ClimateEntity;
    const visual = config.visual;
    const minSetpointLimit = (visual?.min_temperature ?? 5) * 100;
    const maxSetpointLimit = (visual?.max_temperature ?? 35) * 100;

    let systemMode = SystemMode.Off;
    if (mode === 'heat') systemMode = SystemMode.Heat;
    else if (mode === 'cool') systemMode = SystemMode.Cool;
    else if (mode === 'auto') systemMode = SystemMode.Auto;
    else if (mode === 'dry') systemMode = SystemMode.Dry;
    else if (mode === 'fan_only') systemMode = SystemMode.FanOnly;

    const patches: any = {
      localTemperature: typeof currentTemp === 'number' ? currentTemp * 100 : undefined,
      systemMode: systemMode,
    };

    // Safely update feature-specific attributes if they exist on this behavior variant
    if ('occupiedHeatingSetpoint' in this.state) {
      patches.occupiedHeatingSetpoint =
        typeof targetTemp === 'number' ? targetTemp * 100 : undefined;
      patches.minHeatSetpointLimit = minSetpointLimit;
      patches.maxHeatSetpointLimit = maxSetpointLimit;
    }

    if ('occupiedCoolingSetpoint' in this.state) {
      patches.occupiedCoolingSetpoint =
        typeof targetTemp === 'number' ? targetTemp * 100 : undefined;
      patches.minCoolSetpointLimit = minSetpointLimit;
      patches.maxCoolSetpointLimit = maxSetpointLimit;
    }

    applyPatchState(this.state, patches);
  }

  private async systemModeChanged(
    systemMode: SystemMode,
    _oldValue: SystemMode,
    context?: ActionContext,
  ) {
    if (transactionIsOffline(context)) return;
    const homenet = this.agent.get(HomenetEntityBehavior);
    let command = 'off';
    if (systemMode === SystemMode.Heat) command = 'heat';
    else if (systemMode === SystemMode.Cool) command = 'cool';
    else if (systemMode === SystemMode.Auto) command = 'auto';
    else if (systemMode === SystemMode.Dry) command = 'dry';
    else if (systemMode === SystemMode.FanOnly) command = 'fan_only';

    await homenet.state.executeCommand(homenet.entityId, command);
  }

  private async heatingSetpointChanged(value: number, _oldValue: number, context?: ActionContext) {
    if (transactionIsOffline(context)) return;
    const homenet = this.agent.get(HomenetEntityBehavior);
    const targetTemp = value / 100;
    await homenet.state.executeCommand(homenet.entityId, 'temperature', targetTemp);
  }

  private async coolingSetpointChanged(value: number, _oldValue: number, context?: ActionContext) {
    if (transactionIsOffline(context)) return;
    const homenet = this.agent.get(HomenetEntityBehavior);
    const targetTemp = value / 100;
    await homenet.state.executeCommand(homenet.entityId, 'temperature', targetTemp);
  }
}

// 2. Heating-only variant
const HeatingOnlyFeaturedBase = Base.with('Heating');
export class ThermostatServerHeatingOnly extends HeatingOnlyFeaturedBase {
  override async initialize() {
    this.state.controlSequenceOfOperation = Thermostat.ControlSequenceOfOperation.HeatingOnly;
    await super.initialize();

    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update);

    this.reactTo(this.events.systemMode$Changed, this.systemModeChanged);
    this.reactTo(this.events.occupiedHeatingSetpoint$Changed, this.heatingSetpointChanged);
  }

  // Will be populated by copyPrototype
  private update!: (entityState: any) => void;
  private systemModeChanged!: (
    systemMode: SystemMode,
    _oldValue: SystemMode,
    context?: ActionContext,
  ) => Promise<void>;
  private heatingSetpointChanged!: (
    value: number,
    _oldValue: number,
    context?: ActionContext,
  ) => Promise<void>;
}

// 3. Cooling-only variant
const CoolingOnlyFeaturedBase = Base.with('Cooling');
export class ThermostatServerCoolingOnly extends CoolingOnlyFeaturedBase {
  override async initialize() {
    this.state.controlSequenceOfOperation = Thermostat.ControlSequenceOfOperation.CoolingOnly;
    await super.initialize();

    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update);

    this.reactTo(this.events.systemMode$Changed, this.systemModeChanged);
    this.reactTo(this.events.occupiedCoolingSetpoint$Changed, this.coolingSetpointChanged);
  }

  // Will be populated by copyPrototype
  private update!: (entityState: any) => void;
  private systemModeChanged!: (
    systemMode: SystemMode,
    _oldValue: SystemMode,
    context?: ActionContext,
  ) => Promise<void>;
  private coolingSetpointChanged!: (
    value: number,
    _oldValue: number,
    context?: ActionContext,
  ) => Promise<void>;
}

// 4. Heating & Cooling variant (no AutoMode)
const HeatingAndCoolingFeaturedBase = Base.with('Heating', 'Cooling');
export class ThermostatServerHeatingAndCooling extends HeatingAndCoolingFeaturedBase {
  override async initialize() {
    this.state.controlSequenceOfOperation = Thermostat.ControlSequenceOfOperation.CoolingAndHeating;
    await super.initialize();

    const homenet = await this.agent.load(HomenetEntityBehavior);
    this.update(homenet.entityState);
    this.reactTo(homenet.onChange, this.update);

    this.reactTo(this.events.systemMode$Changed, this.systemModeChanged);
    this.reactTo(this.events.occupiedHeatingSetpoint$Changed, this.heatingSetpointChanged);
    this.reactTo(this.events.occupiedCoolingSetpoint$Changed, this.coolingSetpointChanged);
  }

  // Will be populated by copyPrototype
  private update!: (entityState: any) => void;
  private systemModeChanged!: (
    systemMode: SystemMode,
    _oldValue: SystemMode,
    context?: ActionContext,
  ) => Promise<void>;
  private heatingSetpointChanged!: (
    value: number,
    _oldValue: number,
    context?: ActionContext,
  ) => Promise<void>;
  private coolingSetpointChanged!: (
    value: number,
    _oldValue: number,
    context?: ActionContext,
  ) => Promise<void>;
}

// Copy methods to prevent code duplication
copyPrototype(ThermostatServer, ThermostatServerHeatingOnly);
copyPrototype(ThermostatServer, ThermostatServerCoolingOnly);
copyPrototype(ThermostatServer, ThermostatServerHeatingAndCooling);

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
