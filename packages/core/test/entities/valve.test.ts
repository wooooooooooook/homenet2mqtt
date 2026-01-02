import { describe, it, expect } from 'vitest';
import { ValveDevice } from '../../src/protocol/devices/valve.device';
import { ValveEntity } from '../../src/domain/entities/valve.entity';
import { ProtocolConfig } from '../../src/protocol/types';

const protocolConfig: ProtocolConfig = {
  packet_defaults: { rx_length: 5 },
};

describe('Valve Entity', () => {
  const valveConfig: ValveEntity = {
    id: 'test_valve',
    name: 'Test Valve',
    type: 'valve',
    state: { offset: 0, data: [0x50] },
    state_open: { offset: 1, data: [0x64] },
    state_closed: { offset: 1, data: [0x00] },
    state_opening: { offset: 2, data: [0x01] },
    state_closing: { offset: 2, data: [0x02] },
    state_position: { offset: 1, length: 1 },

    command_open: { data: [0x50, 0x64] },
    command_close: { data: [0x50, 0x00] },
    command_stop: { data: [0x50, 0xff] },
    command_position: { data: [0x50, 0x00], value_offset: 1 },
  };

  it('should parse OPEN/CLOSED states', () => {
    const device = new ValveDevice(valveConfig, protocolConfig);

    expect(device.parseData(Buffer.from([0x50, 0x64, 0x00]))).toMatchObject({
      state: 'OPEN',
      position: 100,
    });
    expect(device.parseData(Buffer.from([0x50, 0x00, 0x00]))).toMatchObject({
      state: 'CLOSED',
      position: 0,
    });
  });

  it('should parse OPENING/CLOSING states', () => {
    const device = new ValveDevice(valveConfig, protocolConfig);

    expect(device.parseData(Buffer.from([0x50, 0x32, 0x01]))).toMatchObject({
      state: 'OPENING',
      position: 50,
    });
    expect(device.parseData(Buffer.from([0x50, 0x32, 0x02]))).toMatchObject({
      state: 'CLOSING',
      position: 50,
    });
  });

  it('should construct OPEN/CLOSE/STOP commands', () => {
    const device = new ValveDevice(valveConfig, protocolConfig);

    expect(device.constructCommand('open')).toEqual([0x50, 0x64]);
    expect(device.constructCommand('close')).toEqual([0x50, 0x00]);
    expect(device.constructCommand('stop')).toEqual([0x50, 0xff]);
  });

  it('should construct position command', () => {
    const device = new ValveDevice(valveConfig, protocolConfig);
    expect(device.constructCommand('position', 75)).toEqual([0x50, 0x4b]);
  });
});
