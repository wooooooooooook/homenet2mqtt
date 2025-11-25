import { describe, it, expect } from 'vitest';
import { LightDevice } from '../../src/protocol/devices/light.device';
import { LightEntity } from '../../src/domain/entities/light.entity';
import { ProtocolConfig } from '../../src/protocol/types';

const protocolConfig: ProtocolConfig = {
  packet_defaults: { rx_length: 10 },
};

describe('Light Entity', () => {
  const lightConfig: LightEntity = {
    id: 'test_light',
    name: 'Test Light',
    type: 'light',
    state: { offset: 0, data: [0x30] },
    state_on: { offset: 1, data: [0x01] },
    state_off: { offset: 1, data: [0x00] },
    state_brightness: { offset: 2, length: 1 },
    state_red: { offset: 3, length: 1 },
    state_green: { offset: 4, length: 1 },
    state_blue: { offset: 5, length: 1 },
    state_color_temp: { offset: 6, length: 2, endian: 'big' },
    state_white: { offset: 8, length: 1 },

    command_on: { data: [0x30, 0x01] },
    command_off: { data: [0x30, 0x00] },
    command_brightness: { data: [0x30, 0x01, 0x00], value_offset: 2 },
    command_red: { data: [0x30, 0x02, 0x00], value_offset: 2 },
    command_green: { data: [0x30, 0x02, 0x01], value_offset: 2 },
    command_blue: { data: [0x30, 0x02, 0x02], value_offset: 2 },
    command_color_temp: { data: [0x30, 0x03, 0x00, 0x00], value_offset: 2, length: 2 },
    command_white: { data: [0x30, 0x04, 0x00], value_offset: 2 },
  };

  it('should parse ON state', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    const packet = [0x30, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const result = device.parseData(packet);
    expect(result).toMatchObject({ state: 'ON' });
  });

  it('should parse OFF state', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    const packet = [0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const result = device.parseData(packet);
    expect(result).toMatchObject({ state: 'OFF' });
  });

  it('should parse brightness', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    const packet = [0x30, 0x01, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]; // Brightness 128
    const result = device.parseData(packet);
    expect(result).toMatchObject({ brightness: 128 });
  });

  it('should parse RGB color', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    const packet = [0x30, 0x01, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00]; // Red 255
    const result = device.parseData(packet);
    expect(result).toMatchObject({ red: 255, green: 0, blue: 0 });
  });

  it('should parse color temperature', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    const packet = [0x30, 0x01, 0xff, 0x00, 0x00, 0x00, 0x01, 0xf4, 0x00]; // 500 mireds (0x01F4)
    const result = device.parseData(packet);
    expect(result).toMatchObject({ color_temp: 500 });
  });

  it('should parse white value', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    const packet = [0x30, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff]; // White 255
    const result = device.parseData(packet);
    expect(result).toMatchObject({ white: 255 });
  });

  it('should construct ON command', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    const command = device.constructCommand('on');
    expect(command).toEqual([0x30, 0x01]);
  });

  it('should construct OFF command', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    const command = device.constructCommand('off');
    expect(command).toEqual([0x30, 0x00]);
  });

  it('should construct brightness command', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    const command = device.constructCommand('brightness', 128);
    expect(command).toEqual([0x30, 0x01, 0x80]);
  });

  it('should construct RGB commands', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    expect(device.constructCommand('red', 255)).toEqual([0x30, 0x02, 0xff]);
    expect(device.constructCommand('green', 128)).toEqual([0x30, 0x02, 0x80]);
    expect(device.constructCommand('blue', 64)).toEqual([0x30, 0x02, 0x40]);
  });

  it('should construct color temp command', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    const command = device.constructCommand('color_temp', 500);
    expect(command).toEqual([0x30, 0x03, 0x01, 0xf4]);
  });

  it('should construct white command', () => {
    const device = new LightDevice(lightConfig, protocolConfig);
    const command = device.constructCommand('white', 200);
    expect(command).toEqual([0x30, 0x04, 0xc8]);
  });
});
