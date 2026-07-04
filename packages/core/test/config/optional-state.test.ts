import { describe, it, expect } from 'vitest';
import { normalizeConfig, validateConfig } from '../../src/config/index.js';
import { HomenetBridgeConfig } from '../../src/config/types.js';
import { matchesPacket } from '../../src/utils/packet-matching.js';
import { LightDevice } from '../../src/protocol/devices/light.device.js';

describe('Optional state and state_* schemas', () => {
  it('should normalize null schemas to empty objects', () => {
    const config: HomenetBridgeConfig = {
      serial: {
        portId: 'default',
        path: '/dev/ttyUSB0',
        baud_rate: 9600,
        data_bits: 8,
        parity: 'none',
        stop_bits: 1,
      },
      light: [
        {
          id: 'light_1',
          name: 'Light 1',
          optimistic: true,
          state: null as any,
          state_on: null as any,
          state_off: null as any,
        },
      ],
    };

    const normalized = normalizeConfig(config);
    const light = normalized.light?.[0];

    expect(light).toBeDefined();
    expect(light?.state).toEqual({});
    expect(light?.state_on).toEqual({});
    expect(light?.state_off).toEqual({});
  });

  it('should throw validation error if optimistic: false has empty schemas', () => {
    const config: HomenetBridgeConfig = {
      serial: {
        portId: 'default',
        path: '/dev/ttyUSB0',
        baud_rate: 9600,
        data_bits: 8,
        parity: 'none',
        stop_bits: 1,
      },
      light: [
        {
          id: 'light_1',
          name: 'Light 1',
          optimistic: false,
          state: null as any,
        },
      ],
    };

    const normalized = normalizeConfig(config);
    expect(() => validateConfig(normalized)).toThrowError(
      'optimistic이 true가 아닌 경우 state 스키마 정의는 필수입니다.',
    );
  });

  it('should throw validation error if optimistic: false has empty state_on schema', () => {
    const config: HomenetBridgeConfig = {
      serial: {
        portId: 'default',
        path: '/dev/ttyUSB0',
        baud_rate: 9600,
        data_bits: 8,
        parity: 'none',
        stop_bits: 1,
      },
      light: [
        {
          id: 'light_1',
          name: 'Light 1',
          optimistic: false,
          state: { data: [0x30] },
          state_on: null as any,
        },
      ],
    };

    const normalized = normalizeConfig(config);
    expect(() => validateConfig(normalized)).toThrowError(
      'optimistic이 true가 아닌 경우 빈 스키마(state_on)를 정의할 수 없습니다.',
    );
  });

  it('should always return false when matching empty schema', () => {
    const packet = new Uint8Array([0x01, 0x02, 0x03]);
    const emptySchema = {};

    const matched = matchesPacket(emptySchema, packet, { allowEmptyData: true });
    expect(matched).toBe(false);
  });

  it('should allow empty schemas in optimistic: true to pass validation and return allowed keys', () => {
    const config: HomenetBridgeConfig = {
      serial: {
        portId: 'default',
        path: '/dev/ttyUSB0',
        baud_rate: 9600,
        data_bits: 8,
        parity: 'none',
        stop_bits: 1,
      },
      light: [
        {
          id: 'light_1',
          name: 'Light 1',
          optimistic: true,
          state: null as any,
          state_on: null as any,
          state_off: null as any,
        },
      ],
    };

    const normalized = normalizeConfig(config);
    expect(() => validateConfig(normalized)).not.toThrow();

    const lightConfig = normalized.light?.[0]!;
    const device = new LightDevice(lightConfig, { packet_defaults: { rx_length: 10 } });

    // Ensure we can construct LightDevice and test with getOptimisticState
    expect(device.getOptimisticState('on')).toEqual({ state: 'ON' });
    expect(device.getOptimisticState('off')).toEqual({ state: 'OFF' });
  });
});
