import { describe, it, expect } from 'vitest';
import { LightDevice } from '../src/protocol/devices/light.device.js';
import { DeviceConfig, ProtocolConfig } from '../src/protocol/types.js';

describe('LightDevice Fix', () => {
  it('should correctly match schema with header and mask', () => {
    const deviceConfig: any = {
      id: 'light_4',
      name: 'Light 4',
      state: {
        data: [0x79, 0x15],
      },
      state_on: {
        offset: 2,
        data: [0x01],
        mask: [0x01],
      },
      state_off: {
        offset: 2,
        data: [0x00],
        mask: [0x01],
      },
    };

    const protocolConfig: ProtocolConfig = {
      packet_defaults: {
        rx_header: [0xb0],
      },
    };

    const device = new LightDevice(deviceConfig, protocolConfig);

    // Packet: 0xB0 0x79 0x15 0x01 0x5D
    // Header: B0
    // Payload starts at index 1.
    // state check: index 1 matches 79, index 2 matches 15.
    // state_on check: offset 2.
    // With fix: offset = 2 + 1 (header) = 3.
    // packet[3] = 01. Matches data [01].

    const packet = Buffer.from([0xb0, 0x79, 0x15, 0x01, 0x5d]);

    const updates = device.parseData(packet);

    expect(updates).not.toBeNull();
    expect(updates).toEqual({ state: 'ON' });
  });

  it('should correctly match schema for OFF state', () => {
    const deviceConfig: any = {
      id: 'light_4',
      name: 'Light 4',
      state: {
        data: [0x79, 0x15],
      },
      state_on: {
        offset: 2,
        data: [0x01],
        mask: [0x01],
      },
      state_off: {
        offset: 2,
        data: [0x00],
        mask: [0x01],
      },
    };

    const protocolConfig: ProtocolConfig = {
      packet_defaults: {
        rx_header: [0xb0],
      },
    };

    const device = new LightDevice(deviceConfig, protocolConfig);

    // Packet: 0xB0 0x79 0x15 0x00 0x5C (OFF)
    const packet = Buffer.from([0xb0, 0x79, 0x15, 0x00, 0x5c]);

    const updates = device.parseData(packet);

    expect(updates).not.toBeNull();
    expect(updates).toEqual({ state: 'OFF' });
  });
});
