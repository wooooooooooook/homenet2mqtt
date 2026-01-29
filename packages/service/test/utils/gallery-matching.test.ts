import { describe, it, expect } from 'vitest';
import { buildEntitySignature } from '../../src/utils/gallery-matching.js';

describe('buildEntitySignature', () => {
  it('should match entities with identical packet schemas regardless of id', () => {
    const signatureA = buildEntitySignature('light', {
      id: 'light_1',
      name: '거실 조명',
      state: { data: [0x30, 0x01], mask: [0xff, 0xff], offset: 0 },
      command_on: { data: [0x31, 0x01] },
    });

    const signatureB = buildEntitySignature('light', {
      id: 'light_2',
      name: '안방 조명',
      state: { data: [0x30, 0x01], mask: [0xff, 0xff], offset: 0 },
      command_on: { data: [0x31, 0x01] },
    });

    expect(signatureA).toBe(signatureB);
  });

  it('should differentiate by entity type', () => {
    const signatureA = buildEntitySignature('light', {
      id: 'light_1',
      state: { data: [0x30, 0x01] },
    });
    const signatureB = buildEntitySignature('switch', {
      id: 'switch_1',
      state: { data: [0x30, 0x01] },
    });

    expect(signatureA).not.toBe(signatureB);
  });

  it('should return null when no packet schema is defined', () => {
    const signature = buildEntitySignature('sensor', {
      id: 'sensor_1',
      name: 'no-schema',
    });

    expect(signature).toBeNull();
  });
});
