import { describe, it, expect } from 'vitest';
import { setupTest, processPacket, executeCommand } from './utils';
import { EZVILLE_PACKETS } from '../../../simulator/src/ezville';
import { Buffer } from 'buffer';

describe('HomeNet to MQTT - Ezville Protocol', () => {
  it('should process Ezville packets and publish state', async () => {
    const ctx = await setupTest('ezville.homenet_bridge.yaml');
    const { stateManager, publishMock } = ctx;

    // light_1_0 (ON) - Index 4
    processPacket(stateManager, EZVILLE_PACKETS[4]);

    expect(publishMock).toHaveBeenCalledWith(
      'homenet2mqtt/homedevice1/light_1_1/state',
      JSON.stringify({ state: 'ON' }),
      expect.objectContaining({ retain: true }),
    );

    // thermostat 1 (HEAT) - Index 29
    processPacket(stateManager, EZVILLE_PACKETS[29]);
    expect(publishMock).toHaveBeenCalledWith(
      'homenet2mqtt/homedevice1/thermostat_1/state',
      expect.stringMatching(/"mode":"heat"/),
      expect.objectContaining({ retain: true }),
    );

    // Gas Valve (OPEN) - Index 40
    processPacket(stateManager, EZVILLE_PACKETS[40]);
    expect(publishMock).toHaveBeenCalledWith(
      'homenet2mqtt/homedevice1/gas_valve/state',
      JSON.stringify({ state: 'OPEN' }),
      expect.objectContaining({ retain: true }),
    );

    // outlet_1_1 (ON) - Index 43
    processPacket(stateManager, EZVILLE_PACKETS[43]);
    expect(publishMock).toHaveBeenCalledWith(
      'homenet2mqtt/homedevice1/outlet_1_1/state',
      JSON.stringify({ state: 'ON' }),
      expect.objectContaining({ retain: true }),
    );
  });

  it('should generate command packets', async () => {
    const ctx = await setupTest('ezville.homenet_bridge.yaml');

    // Command ON for light_1_0
    // Data: [0x0e, 0x11, 0x41, 0x03, 0x0f, 0x01, 0x00]
    // Checksum: XOR_ADD (2 bytes) -> A4 0E
    // Header: F7
    await executeCommand(ctx, 'light_1_0', 'on', null);
    const expectedLight = Buffer.from([0xf7, 0x0e, 0x11, 0x41, 0x03, 0x0f, 0x01, 0x00, 0xa4, 0x0e]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedLight);

    // Command Close for gas_valve
    // Data: [0x33, 0x01, 0x81, 0x03, 0x00, 0x05, 0x00]
    // Checksum: XOR_ADD -> 42 F6
    // Header: F7
    await executeCommand(ctx, 'gas_valve', 'close', null);
    const expectedGas = Buffer.from([0xf7, 0x33, 0x01, 0x81, 0x03, 0x00, 0x05, 0x00, 0x42, 0xf6]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedGas);

    // Command ON for outlet_1_1
    // Data: [0x39, 0x11, 0x41, 0x01, 0x11]
    // Checksum: XOR_ADD -> 8E 22
    // Header: F7
    await executeCommand(ctx, 'outlet_1_1', 'on', null);
    const expectedOutletOn = Buffer.from([0xf7, 0x39, 0x11, 0x41, 0x01, 0x11, 0x8e, 0x22]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedOutletOn);

    // Command OFF for outlet_1_1
    // Data: [0x39, 0x11, 0x41, 0x01, 0x10]
    // Checksum: XOR_ADD -> 8F 22
    // Header: F7
    await executeCommand(ctx, 'outlet_1_1', 'off', null);
    const expectedOutletOff = Buffer.from([0xf7, 0x39, 0x11, 0x41, 0x01, 0x10, 0x8f, 0x22]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedOutletOff);

    // Command OFF for thermostat_1
    // Data: [0x36, 0x11, 0x43, 0x01, 0x00]
    // Checksum: XOR_ADD -> 92 14
    // Header: F7
    await executeCommand(ctx, 'thermostat_1', 'off', null);
    const expectedThermoOff = Buffer.from([0xf7, 0x36, 0x11, 0x43, 0x01, 0x00, 0x92, 0x14]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedThermoOff);

    // Command HEAT for thermostat_1
    // Data: [0x36, 0x11, 0x43, 0x01, 0x01]
    // Checksum: XOR_ADD -> 93 16
    // Header: F7
    await executeCommand(ctx, 'thermostat_1', 'heat', null);
    const expectedThermoHeat = Buffer.from([0xf7, 0x36, 0x11, 0x43, 0x01, 0x01, 0x93, 0x16]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedThermoHeat);

    // Command PRESET AWAY for thermostat_1
    // Data: [0x36, 0x11, 0x45, 0x01, 0x01]
    // Checksum: XOR_ADD -> 95 1A
    // Header: F7
    await executeCommand(ctx, 'thermostat_1', 'preset_away', null);
    const expectedThermoAway = Buffer.from([0xf7, 0x36, 0x11, 0x45, 0x01, 0x01, 0x95, 0x1a]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedThermoAway);

    // Command PRESET NONE for thermostat_1
    // Data: [0x36, 0x11, 0x45, 0x01, 0x00]
    // Checksum: XOR_ADD -> 94 18
    // Header: F7
    await executeCommand(ctx, 'thermostat_1', 'preset_none', null);
    const expectedThermoNone = Buffer.from([0xf7, 0x36, 0x11, 0x45, 0x01, 0x00, 0x94, 0x18]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedThermoNone);

    // Command TEMPERATURE for thermostat_1 (25 degrees)
    // Data: [0x36, 0x11, 0x44, 0x01, 0x19] (25 in hex is 0x19)
    // Checksum: XOR_ADD -> 8C 28
    // Header: F7
    await executeCommand(ctx, 'thermostat_1', 'temperature', 25);
    const expectedThermoTemp = Buffer.from([0xf7, 0x36, 0x11, 0x44, 0x01, 0x19, 0x8c, 0x28]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedThermoTemp);

    // Command ON for elevator_call
    // Data: [0x33, 0x01, 0x81, 0x03, 0x00, 0x24, 0x00]
    // Checksum: XOR_ADD -> 63 36
    // Header: F7
    await executeCommand(ctx, 'elevator_call', 'press', null);
    const expectedElevator = Buffer.from([
      0xf7, 0x33, 0x01, 0x81, 0x03, 0x00, 0x24, 0x00, 0x63, 0x36,
    ]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedElevator);

    // Command UPDATE for total_water_usage
    // Data: [0x30, 0x01, 0x01, 0x00]
    await executeCommand(ctx, 'total_water_usage', 'update', null);
    const expectedWaterUpdate = Buffer.from([0xf7, 0x30, 0x01, 0x01, 0x00, 0xc7, 0xf0]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedWaterUpdate);

    // Command UPDATE for total_gas_usage
    // Data: [0x30, 0x02, 0x01, 0x00]
    // Checksum: XOR_ADD -> C4 EE
    // Header: F7
    await executeCommand(ctx, 'total_gas_usage', 'update', null);
    const expectedGasUpdate = Buffer.from([0xf7, 0x30, 0x02, 0x01, 0x00, 0xc4, 0xee]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedGasUpdate);
  });
});
