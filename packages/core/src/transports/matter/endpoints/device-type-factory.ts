// packages/core/src/transports/matter/endpoints/device-type-factory.ts

import { EndpointType } from '@matter/main/node';
import {
  OnOffLightDevice,
  DimmableLightDevice,
  OnOffPlugInUnitDevice,
  ThermostatDevice,
  DoorLockDevice,
  ContactSensorDevice,
  OccupancySensorDevice,
  TemperatureSensorDevice,
  HumiditySensorDevice,
  LightSensorDevice,
  FanDevice,
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
import { BooleanStateServer } from '../behaviors/boolean-state-server.js';
import { OccupancySensingServer } from '../behaviors/occupancy-sensing-server.js';
import { TemperatureMeasurementServer } from '../behaviors/temperature-measurement-server.js';
import { HumidityMeasurementServer } from '../behaviors/humidity-measurement-server.js';
import { IlluminanceMeasurementServer } from '../behaviors/illuminance-measurement-server.js';
import { FanControlServer } from '../behaviors/fan-control-server.js';
import { NumberLevelControlServer } from '../behaviors/number-level-control-server.js';
import { SelectModeServer } from '../behaviors/select-mode-server.js';
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

const HomenetContactSensor = ContactSensorDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  BooleanStateServer,
);

const HomenetOccupancySensor = OccupancySensorDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  OccupancySensingServer,
);

const HomenetTemperatureSensor = TemperatureSensorDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  TemperatureMeasurementServer,
);

const HomenetHumiditySensor = HumiditySensorDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  HumidityMeasurementServer,
);

const HomenetIlluminanceSensor = LightSensorDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  IlluminanceMeasurementServer,
);

const HomenetFan = FanDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  OnOffServer,
  FanControlServer,
);

const HomenetNumber = OnOffPlugInUnitDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  OnOffServer,
  NumberLevelControlServer,
);

const HomenetSelect = OnOffPlugInUnitDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomenetEntityBehavior,
  OnOffServer,
  SelectModeServer,
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

  if (type === 'binary_sensor') {
    const deviceClass = (config as any).device_class;
    if (deviceClass === 'occupancy' || deviceClass === 'motion' || deviceClass === 'presence') {
      return HomenetOccupancySensor;
    }
    return HomenetContactSensor;
  }

  if (type === 'sensor') {
    const deviceClass = (config as any).device_class;
    const unit = (config as any).unit_of_measurement;
    if (deviceClass === 'temperature' || unit === '°C' || unit === '°F') {
      return HomenetTemperatureSensor;
    }
    if (deviceClass === 'humidity' || unit === '%') {
      return HomenetHumiditySensor;
    }
    if (deviceClass === 'illuminance' || unit === 'lx') {
      return HomenetIlluminanceSensor;
    }
    // Default to TemperatureSensor for other numeric sensors to make them visible
    return HomenetTemperatureSensor;
  }

  if (type === 'button') {
    return HomenetSwitch;
  }

  if (type === 'fan') {
    return HomenetFan;
  }

  if (type === 'number') {
    return HomenetNumber;
  }

  if (type === 'select') {
    return HomenetSelect;
  }

  return undefined;
}
