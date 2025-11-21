import { describe, it, expect } from 'vitest';
import { SwitchDevice } from '../../src/protocol/devices/switch.device';
import { SwitchEntity } from '../../src/domain/entities/switch.entity';
import { ProtocolConfig } from '../../src/protocol/types';

const protocolConfig: ProtocolConfig = {
    packet_defaults: { rx_length: 5 }
};

describe('Switch Entity', () => {
    const switchConfig: SwitchEntity = {
        id: 'test_switch',
        name: 'Test Switch',
        type: 'switch',
        state: { offset: 0, data: [0x60] },
        state_on: { offset: 1, data: [0x01] },
        state_off: { offset: 1, data: [0x00] },

        command_on: { data: [0x60, 0x01] },
        command_off: { data: [0x60, 0x00] }
    };

    it('should parse ON/OFF state', () => {
        const device = new SwitchDevice(switchConfig, protocolConfig);

        expect(device.parseData([0x60, 0x01])).toMatchObject({ state: 'ON' });
        expect(device.parseData([0x60, 0x00])).toMatchObject({ state: 'OFF' });
    });

    it('should construct ON/OFF commands', () => {
        const device = new SwitchDevice(switchConfig, protocolConfig);

        expect(device.constructCommand('on')).toEqual([0x60, 0x01]);
        expect(device.constructCommand('off')).toEqual([0x60, 0x00]);
    });
});
