import { describe, it, expect } from 'vitest';
import { FanDevice } from '../../src/protocol/devices/fan.device';
import { FanEntity } from '../../src/domain/entities/fan.entity';
import { ProtocolConfig } from '../../src/protocol/types';

const protocolConfig: ProtocolConfig = {
    packet_defaults: { rx_length: 5 }
};

describe('Fan Entity', () => {
    const fanConfig: FanEntity = {
        id: 'test_fan',
        name: 'Test Fan',
        type: 'fan',
        state: { offset: 0, data: [0x40] },
        state_on: { offset: 1, data: [0x01] },
        state_off: { offset: 1, data: [0x00] },
        state_speed: { offset: 2, length: 1 },
        state_oscillating: { offset: 3, data: [0x01] },
        state_direction: { offset: 4, data: [0x00] }, // 0=forward

        command_on: { data: [0x40, 0x01] },
        command_off: { data: [0x40, 0x00] },
        command_speed: { data: [0x40, 0x02, 0x00], value_offset: 2 },
        command_oscillating: { data: [0x40, 0x03, 0x00], value_offset: 2 },
        command_direction: { data: [0x40, 0x04, 0x00], value_offset: 2 }
    };

    it('should parse ON/OFF state', () => {
        const device = new FanDevice(fanConfig, protocolConfig);

        expect(device.parseData([0x40, 0x01, 0x00, 0x00, 0x00])).toMatchObject({ state: 'ON' });
        expect(device.parseData([0x40, 0x00, 0x00, 0x00, 0x00])).toMatchObject({ state: 'OFF' });
    });

    it('should parse speed, oscillation, and direction', () => {
        const device = new FanDevice(fanConfig, protocolConfig);
        // Speed 50 (0x32), Oscillation ON (0x01), Forward (0x00)
        const packet = [0x40, 0x01, 0x32, 0x01, 0x00];
        const result = device.parseData(packet);
        expect(result).toMatchObject({
            state: 'ON',
            speed: 50,
            oscillating: true,
            direction: 'forward'
        });
    });

    it('should construct ON/OFF commands', () => {
        const device = new FanDevice(fanConfig, protocolConfig);
        expect(device.constructCommand('on')).toEqual([0x40, 0x01]);
        expect(device.constructCommand('off')).toEqual([0x40, 0x00]);
    });

    it('should construct speed command', () => {
        const device = new FanDevice(fanConfig, protocolConfig);
        expect(device.constructCommand('speed', 50)).toEqual([0x40, 0x02, 0x32]);
    });

    it('should construct oscillation command', () => {
        const device = new FanDevice(fanConfig, protocolConfig);
        expect(device.constructCommand('oscillating', true)).toEqual([0x40, 0x03, 0x01]);
        expect(device.constructCommand('oscillating', false)).toEqual([0x40, 0x03, 0x00]);
    });

    it('should construct direction command', () => {
        const device = new FanDevice(fanConfig, protocolConfig);
        expect(device.constructCommand('direction', 'forward')).toEqual([0x40, 0x04, 0x00]);
        expect(device.constructCommand('direction', 'reverse')).toEqual([0x40, 0x04, 0x01]);
    });
});
