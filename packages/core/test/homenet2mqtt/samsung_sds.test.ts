import { describe, it, expect } from 'vitest';
import { setupTest, processPacket } from './utils';
import { SAMSUNG_SDS_PACKETS } from '../../../simulator/src/samsung_sds';

describe('HomeNet to MQTT - Samsung SDS Protocol', () => {
  it('should process light packets', async () => {
    const ctx = await setupTest('samsung_sds.homenet_bridge.yaml');
    const { stateManager, publishMock } = ctx;

    // Light 1 (ON) - Index 1
    processPacket(stateManager, SAMSUNG_SDS_PACKETS[1]);

    expect(publishMock).toHaveBeenCalledWith(
      'homenet2mqtt/homedevice1/light_1/state',
      JSON.stringify({ state: 'ON' }),
      expect.objectContaining({ retain: true }),
    );

    // Light 1 (OFF) - Index 2
    processPacket(stateManager, SAMSUNG_SDS_PACKETS[2]);
    expect(publishMock).toHaveBeenCalledWith(
      'homenet2mqtt/homedevice1/light_1/state',
      JSON.stringify({ state: 'OFF' }),
      expect.objectContaining({ retain: true }),
    );
  });

  it('should process ventilator packets', async () => {
    const ctx = await setupTest('samsung_sds.homenet_bridge.yaml');
    const { stateManager, publishMock } = ctx;

    // 참고: C2 4E 00 00 00 PT -> B0 4E XX MM YY PT 형태
    processPacket(stateManager, SAMSUNG_SDS_PACKETS[14]);
    expect(publishMock).toHaveBeenCalledWith(
      'homenet2mqtt/homedevice1/ventilator/state',
      JSON.stringify({ speed: 0, state: 'OFF' }),
      expect.objectContaining({ retain: true }),
    );
  });

  it('should process heating packets', async () => {
    const ctx = await setupTest('samsung_sds.homenet_bridge.yaml');
    const { stateManager, publishMock } = ctx;

    // Room 0 Heater (Idle, 25/26) - Index 18
    processPacket(stateManager, SAMSUNG_SDS_PACKETS[18]);

    expect(publishMock).toHaveBeenCalledWith(
      'homenet2mqtt/homedevice1/room_0_heater/state',
      JSON.stringify({
        action: 'idle',
        current_temperature: 23,
        target_temperature: 22,
        mode: 'heat',
      }),
      expect.objectContaining({ retain: true }),
    );
  });
});
