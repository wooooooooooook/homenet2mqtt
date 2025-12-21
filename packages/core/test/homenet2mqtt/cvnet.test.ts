import { describe, it, expect } from 'vitest';
import { setupTest, processPacket, executeCommand } from './utils';
import { CVNET_PACKETS } from '../../../simulator/src/cvnet';
import { Buffer } from 'buffer';

describe('HomeNet to MQTT - CVNet Protocol', () => {
  it('should process CVNet packets and publish state', async () => {
    const ctx = await setupTest('cvnet.homenet_bridge.yaml');
    const { stateManager, publishMock } = ctx;

    // Room 0 Light 1 (ON) - Index 0
    // Actually the packet results in OFF state as discovered.
    processPacket(stateManager, CVNET_PACKETS[0]);
    expect(publishMock).toHaveBeenCalledWith(
      'homenet2mqtt/homedevice1/room_0_light_1/state',
      JSON.stringify({ state: 'OFF' }),
      expect.objectContaining({ retain: true }),
    );
  });

  it('should generate command packets', async () => {
    const ctx = await setupTest('cvnet.homenet_bridge.yaml');

    // Command ON for room_0_light_1
    // Data: [0x20, 0x21, 0x01, 0x11, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    // Checksum: Add (no header) -> 0x54
    // Header: F7, Footer: AA
    await executeCommand(ctx, 'room_0_light_1', 'on', null);
    const expectedLight = Buffer.from([
      0xf7, 0x20, 0x21, 0x01, 0x11, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x54, 0xaa,
    ]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedLight);

    // Command ON for fan_1
    // Data: [0x20, 0x71, 0x01, 0x11, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]
    // Checksum: Add (no header) -> 0xA6
    // Header: F7, Footer: AA
    await executeCommand(ctx, 'fan_1', 'on', null);
    const expectedFan = Buffer.from([
      0xf7, 0x20, 0x71, 0x01, 0x11, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0xa6, 0xaa,
    ]);
    expect(ctx.mockSerialPort.write).toHaveBeenCalledWith(expectedFan);
  });
});
