// packages/core/src/transports/matter/behaviors/thermostat-server.ts

import { ThermostatServer as Base } from '@matter/main/behaviors';
import { Thermostat } from '@matter/main/clusters';
import { applyPatchState } from '../utils/apply-patch-state.js';
import { HomenetEntityBehavior } from './homenet-entity-behavior.js';
import { transactionIsOffline } from '../utils/transaction-is-offline.js';
import type { ActionContext } from '@matter/main';

import { ClimateEntity } from '../../../domain/entities/climate.entity.js';

import SystemMode = Thermostat.SystemMode;

const FeaturedBase = Base.with('Heating', 'Cooling', 'AutoMode');

export class ThermostatServer extends FeaturedBase {
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

    applyPatchState(this.state, {
      localTemperature: typeof currentTemp === 'number' ? currentTemp * 100 : undefined,
      systemMode: systemMode,
      occupiedHeatingSetpoint: typeof targetTemp === 'number' ? targetTemp * 100 : undefined,
      occupiedCoolingSetpoint: typeof targetTemp === 'number' ? targetTemp * 100 : undefined,
      minHeatSetpointLimit: minSetpointLimit,
      maxHeatSetpointLimit: maxSetpointLimit,
      minCoolSetpointLimit: minSetpointLimit,
      maxCoolSetpointLimit: maxSetpointLimit,
    });
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
export namespace ThermostatServer {
  export class State extends FeaturedBase.State {}
}
