// packages/core/src/transports/matter/endpoints/device-type-factory.ts

import { EndpointType } from '@matter/main/node';
import {
  OnOffLightDevice,
  DimmableLightDevice,
  OnOffPlugInUnitDevice,
  ThermostatDevice,
  DoorLockDevice,
} from '@matter/main/devices';
import { IdentifyServer } from '@matter/main/behaviors';
import { BasicInformationServer } from '../behaviors/basic-information-server.js';
import { HomenetEntityBehavior } from '../behaviors/homenet-entity-behavior.js';
import { OnOffServer } from '../behaviors/on-off-server.js';
import { LevelControlServer } from '../behaviors/level-control-server.js';
import {
  ThermostatServer,
  ThermostatServerHeatingOnly,
  ThermostatServerCoolingOnly,
  ThermostatServerHeatingAndCooling,
} from '../behaviors/thermostat-server.js';
import { LockServer } from '../behaviors/lock-server.js';
import type { EntityConfig } from '../../../domain/entities/base.entity.js';

// Define endpoint types using .with()
const HomenetOnOffLight = OnOffLightDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  OnOffServer,
);

const HomenetDimmableLight = DimmableLightDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  OnOffServer,
  LevelControlServer,
);

const HomenetSwitch = OnOffPlugInUnitDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  OnOffServer,
);

const HomenetThermostatFull = ThermostatDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  ThermostatServer,
);

const HomenetThermostatHeatingOnly = ThermostatDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  ThermostatServerHeatingOnly,
);

const HomenetThermostatCoolingOnly = ThermostatDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  ThermostatServerCoolingOnly,
);

const HomenetThermostatHeatingAndCooling = ThermostatDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  ThermostatServerHeatingAndCooling,
);

const HomenetLock = DoorLockDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  LockServer,
);

export function createEndpointType(type: string, config: EntityConfig): EndpointType | undefined {
  if (type === 'light') {
    // If it has brightness control, use DimmableLight
    const hasBrightness = (config as any).state_brightness || (config as any).command_brightness;
    return hasBrightness ? HomenetDimmableLight : HomenetOnOffLight;
  }

  if (type === 'switch') {
    return HomenetSwitch;
  }

  if (type === 'valve') {
    // Treat valve as OnOffPlugInUnit (switch) for simplicity
    return HomenetSwitch;
  }

  if (type === 'climate') {
    const climate = config as any;
    const supportsHeating = !!(climate.state_heat || climate.command_heat);
    const supportsCooling = !!(climate.state_cool || climate.command_cool);
    const supportsAuto = !!(climate.state_auto || climate.command_auto);

    if (supportsHeating && supportsCooling) {
      return supportsAuto ? HomenetThermostatFull : HomenetThermostatHeatingAndCooling;
    }
    if (supportsCooling) {
      return HomenetThermostatCoolingOnly;
    }
    // Default to heating-only for floor heating and general Korean apartments
    return HomenetThermostatHeatingOnly;
  }

  if (type === 'lock') {
    return HomenetLock;
  }

  return undefined;
}
