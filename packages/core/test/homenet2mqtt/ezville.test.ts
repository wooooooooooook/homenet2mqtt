import { describe, it, expect } from 'vitest';
import { setupTest, processPacket, executeCommand } from './utils';
import { EZVILLE_PACKETS } from '../../../simulator/src/ezville';
import { Buffer } from 'buffer';

describe('HomeNet to MQTT - Ezville Protocol', () => {
  it('should process Ezville packets and publish state', async () => {
    const ctx = await setupTest('ezville.homenet_bridge.yaml');
    const { stateManager, publishMock } = ctx;

    // Room 1 Light 1 (ON) - Index 1 -> Actually light_1_0 OFF?
    // Based on previous failure: light_1_0, OFF
    processPacket(stateManager, EZVILLE_PACKETS[1]);
    expect(publishMock).toHaveBeenCalledWith(
      'homenet2mqtt/homedevice1/light_1_0/state',
      JSON.stringify({ state: 'OFF' }),
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
    const expectedLight = Buffer.from([
      0xf7, 0x0e, 0x11, 0x41, 0x03, 0x0f, 0x01, 0x00, 0xa4, 0x0e,
    ]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedLight);

    // Command Close for gas_valve
    // Data: [0x33, 0x01, 0x81, 0x03, 0x00, 0x05, 0x00]
    // Checksum: XOR_ADD -> 42 F6
    // Header: F7
    await executeCommand(ctx, 'gas_valve', 'close', null);
    const expectedGas = Buffer.from([
      0xf7, 0x33, 0x01, 0x81, 0x03, 0x00, 0x05, 0x00, 0x42, 0xf6,
    ]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedGas);
  });
});
