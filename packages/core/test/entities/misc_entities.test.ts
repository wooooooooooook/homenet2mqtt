import { describe, it, expect } from 'vitest';
import { TextDevice } from '../../src/protocol/devices/text.device';
import { NumberDevice } from '../../src/protocol/devices/number.device';
import { SelectDevice } from '../../src/protocol/devices/select.device';
import { ButtonDevice } from '../../src/protocol/devices/button.device';
import { LockDevice } from '../../src/protocol/devices/lock.device';
import { TextEntity } from '../../src/domain/entities/text.entity';
import { NumberEntity } from '../../src/domain/entities/number.entity';
import { SelectEntity } from '../../src/domain/entities/select.entity';
import { ButtonEntity } from '../../src/domain/entities/button.entity';
import { LockEntity } from '../../src/domain/entities/lock.entity';
import { ProtocolConfig } from '../../src/protocol/types';

const protocolConfig: ProtocolConfig = {
  packet_defaults: { rx_length: 5 },
};

describe('Text Entity', () => {
  const textConfig: TextEntity = {
    id: 'test_text',
    name: 'Test Text',
    type: 'text',
    state: { offset: 0, data: [0x80] },
    state_text: { offset: 1, length: 5 },
    command_text: { data: [0x80, 0x01], value_offset: 2, length: 5, value_encode: 'ascii' },
  };

  it('should parse text value', () => {
    const device = new TextDevice(textConfig, protocolConfig);
    // "HELLO" in ASCII
    const packet = [0x80, 0x48, 0x45, 0x4c, 0x4c, 0x4f];
    expect(device.parseData(packet)).toMatchObject({ text: 'HELLO' });
  });

  it('should construct text command', () => {
    const device = new TextDevice(textConfig, protocolConfig);
    // "TEST" -> 0x54 0x45 0x53 0x54 0x00 (padded)
    expect(device.constructCommand('set', 'TEST')).toEqual([
      0x80, 0x01, 0x54, 0x45, 0x53, 0x54, 0x00,
    ]);
  });
});

describe('Number Entity', () => {
  const numberConfig: NumberEntity = {
    id: 'test_number',
    name: 'Test Number',
    type: 'number',
    state: { offset: 0, data: [0x81] },
    state_number: { offset: 1, length: 1 },
    command_number: { data: [0x81, 0x01], value_offset: 2 },
    min_value: 0,
    max_value: 100,
  };

  it('should parse number value', () => {
    const device = new NumberDevice(numberConfig, protocolConfig);
    expect(device.parseData([0x81, 50])).toMatchObject({ value: 50 });
  });

  it('should construct number command', () => {
    const device = new NumberDevice(numberConfig, protocolConfig);
    expect(device.constructCommand('set', 42)).toEqual([0x81, 0x01, 42]);
  });
});

describe('Select Entity', () => {
  const selectConfig: SelectEntity = {
    id: 'test_select',
    name: 'Test Select',
    type: 'select',
    state: { offset: 0, data: [0x82] },
    state_select: { offset: 1, length: 1, map: { 1: 'Option A', 2: 'Option B' } },
    command_select: { data: [0x82, 0x01], value_offset: 2, map: { 'Option A': 1, 'Option B': 2 } },
    options: ['Option A', 'Option B'],
  };

  it('should parse select value', () => {
    const device = new SelectDevice(selectConfig, protocolConfig);
    expect(device.parseData([0x82, 1])).toMatchObject({ option: 'Option A' });
    expect(device.parseData([0x82, 2])).toMatchObject({ option: 'Option B' });
  });

  it('should construct select command', () => {
    const device = new SelectDevice(selectConfig, protocolConfig);
    expect(device.constructCommand('select', 'Option A')).toEqual([0x82, 0x01, 1]);
    expect(device.constructCommand('select', 'Option B')).toEqual([0x82, 0x01, 2]);
  });
});

describe('Button Entity', () => {
  const buttonConfig: ButtonEntity = {
    id: 'test_button',
    name: 'Test Button',
    type: 'button',
    command_press: { data: [0x83, 0x01] },
  };

  it('should construct press command', () => {
    const device = new ButtonDevice(buttonConfig, protocolConfig);
    expect(device.constructCommand('press')).toEqual([0x83, 0x01]);
  });
});

describe('Lock Entity', () => {
  const lockConfig: LockEntity = {
    id: 'test_lock',
    name: 'Test Lock',
    type: 'lock',
    state: { offset: 0, data: [0x84] },
    state_locked: { offset: 1, data: [0x01] },
    state_unlocked: { offset: 1, data: [0x00] },
    command_lock: { data: [0x84, 0x01] },
    command_unlock: { data: [0x84, 0x00] },
  };

  it('should parse locked/unlocked state', () => {
    const device = new LockDevice(lockConfig, protocolConfig);
    expect(device.parseData([0x84, 0x01])).toMatchObject({ state: 'LOCKED' });
    expect(device.parseData([0x84, 0x00])).toMatchObject({ state: 'UNLOCKED' });
  });

  it('should construct lock/unlock commands', () => {
    const device = new LockDevice(lockConfig, protocolConfig);
    expect(device.constructCommand('lock')).toEqual([0x84, 0x01]);
    expect(device.constructCommand('unlock')).toEqual([0x84, 0x00]);
  });
});
