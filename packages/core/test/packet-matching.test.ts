import { describe, it, expect } from 'vitest';

import { matchesPacket } from '../src/utils/packet-matching.js';
import { StateSchema } from '../src/protocol/types.js';

describe('matchesPacket', () => {
  it('should apply guard expression after data match', () => {
    const schema: StateSchema = {
      index: 0,
      data: [0x01, 0x02],
      guard: 'data[2] == 0x03',
    };

    expect(matchesPacket(schema, Buffer.from([0x01, 0x02, 0x03]))).toBe(true);
    expect(matchesPacket(schema, Buffer.from([0x01, 0x02, 0x04]))).toBe(false);
  });

  it('should exclude packets that match an except schema', () => {
    const schema: StateSchema = {
      index: 0,
      data: [0x01, 0x02],
      except: [
        {
          index: 2,
          data: [0xff],
        },
      ],
    };

    expect(matchesPacket(schema, Buffer.from([0x01, 0x02, 0x10]))).toBe(true);
    expect(matchesPacket(schema, Buffer.from([0x01, 0x02, 0xff]))).toBe(false);
  });

  it('should return false if packet is too short for data', () => {
    const schema: StateSchema = {
      index: 0,
      data: [0x01, 0x02, 0x03],
    };
    expect(matchesPacket(schema, Buffer.from([0x01, 0x02]))).toBe(false);
  });

  it('should support index field as primary position key', () => {
    const schema: StateSchema = {
      index: 1,
      data: [0xaa, 0xbb],
    };

    expect(matchesPacket(schema, Buffer.from([0x00, 0xaa, 0xbb]))).toBe(true);
    expect(matchesPacket(schema, Buffer.from([0xaa, 0xbb, 0x00]))).toBe(false);
  });
});
