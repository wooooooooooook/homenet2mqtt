// packages/core/test/transports/matter/device-type-factory.test.ts

import { describe, it, expect } from 'vitest';
import { createEndpointType } from '../../../src/transports/matter/endpoints/device-type-factory.js';
import {
  OnOffLightDevice,
  DimmableLightDevice,
  OnOffPlugInUnitDevice,
  ThermostatDevice,
  DoorLockDevice,
} from '@matter/main/devices';

describe('Matter Device Type Factory', () => {
  it('should map light without brightness to OnOffLightDevice', () => {
    const config = {
      id: 'light1',
      name: 'Light 1',
      type: 'light',
    } as any;

    const endpointType = createEndpointType('light', config);
    expect(endpointType).toBeDefined();
    expect(endpointType?.deviceType).toBe(OnOffLightDevice.deviceType);
  });

  it('should map light with brightness to DimmableLightDevice', () => {
    const config = {
      id: 'light2',
      name: 'Light 2',
      type: 'light',
      state_brightness: { type: 'json' },
    } as any;

    const endpointType = createEndpointType('light', config);
    expect(endpointType).toBeDefined();
    expect(endpointType?.deviceType).toBe(DimmableLightDevice.deviceType);
  });

  it('should map switch and valve to OnOffPlugInUnitDevice', () => {
    const switchConfig = {
      id: 'switch1',
      name: 'Switch 1',
      type: 'switch',
    } as any;
    const valveConfig = {
      id: 'valve1',
      name: 'Valve 1',
      type: 'valve',
    } as any;

    const switchEndpoint = createEndpointType('switch', switchConfig);
    const valveEndpoint = createEndpointType('valve', valveConfig);

    expect(switchEndpoint?.deviceType).toBe(OnOffPlugInUnitDevice.deviceType);
    expect(valveEndpoint?.deviceType).toBe(OnOffPlugInUnitDevice.deviceType);
  });

  it('should map climate config to the correct HomenetThermostat variant', () => {
    // 1. Heating only
    const heatOnlyConfig = {
      id: 'climate_heat',
      name: 'Boiler',
      type: 'climate',
      command_heat: {},
    } as any;
    const heatOnlyEndpoint = createEndpointType('climate', heatOnlyConfig);
    expect(heatOnlyEndpoint?.deviceType).toBe(ThermostatDevice.deviceType);

    // 2. Cooling only
    const coolOnlyConfig = {
      id: 'climate_cool',
      name: 'AC Cool',
      type: 'climate',
      command_cool: {},
    } as any;
    const coolOnlyEndpoint = createEndpointType('climate', coolOnlyConfig);
    expect(coolOnlyEndpoint?.deviceType).toBe(ThermostatDevice.deviceType);

    // 3. Heating and Cooling without auto
    const heatCoolConfig = {
      id: 'climate_both',
      name: 'AC both',
      type: 'climate',
      command_heat: {},
      command_cool: {},
    } as any;
    const bothEndpoint = createEndpointType('climate', heatCoolConfig);
    expect(bothEndpoint?.deviceType).toBe(ThermostatDevice.deviceType);

    // 4. Full featured (heating + cooling + auto)
    const fullConfig = {
      id: 'climate_full',
      name: 'AC Full',
      type: 'climate',
      command_heat: {},
      command_cool: {},
      command_auto: {},
    } as any;
    const fullEndpoint = createEndpointType('climate', fullConfig);
    expect(fullEndpoint?.deviceType).toBe(ThermostatDevice.deviceType);
  });

  it('should map lock to DoorLockDevice', () => {
    const config = {
      id: 'lock1',
      name: 'Lock 1',
      type: 'lock',
    } as any;

    const endpointType = createEndpointType('lock', config);
    expect(endpointType?.deviceType).toBe(DoorLockDevice.deviceType);
  });

  it('should return undefined for unsupported device types', () => {
    const config = {
      id: 'sensor1',
      name: 'Sensor 1',
      type: 'sensor',
    } as any;

    expect(createEndpointType('sensor', config)).toBeUndefined();
  });
});
