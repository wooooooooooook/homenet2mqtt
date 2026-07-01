import { describe, it, expect } from 'vitest';
import {
  evaluateDiscovery,
  prepareDiscoveryPackets,
  type DiscoverySchema,
} from '../../src/services/discovery.service.js';

describe('Discovery Service - Default Offset', () => {
  const packetDictionary: Record<string, string> = {
    '1': 'B0 01 02 03 04', // Header B0, 5 bytes
  };
  const unmatchedPackets: string[] = [];

  // Prepare packets for discovery
  const packets = prepareDiscoveryPackets(packetDictionary, unmatchedPackets);

  it('should use defaultOffset when match.index is undefined', () => {
    const discovery: DiscoverySchema = {
      match: {
        // No index defined, should match '01' at index 1 if defaultOffset is 1
        data: [0x01],
      },
      dimensions: [],
    };

    // With defaultOffset = 1 (skipping B0)
    const resultWithOffset = evaluateDiscovery(discovery, packets, 1);
    expect(resultWithOffset.matched).toBe(true);
    expect(resultWithOffset.matchedPacketCount).toBe(1);

    // With defaultOffset = 0 (matching B0 against 01 -> fail)
    const resultWithoutOffset = evaluateDiscovery(discovery, packets, 0);
    expect(resultWithoutOffset.matched).toBe(false);
  });

  it('should prioritize match.index over defaultOffset', () => {
    const discovery: DiscoverySchema = {
      match: {
        // Explicit index 2, should match '02' at index 2
        index: 2,
        data: [0x02],
      },
      dimensions: [],
    };

    // Even if defaultOffset is 0 or 1, it should use index 2
    const result = evaluateDiscovery(
      discovery,
      packets,
      0, // defaultOffset ignored
    );
    expect(result.matched).toBe(true);
  });

  it('should support legacy match.offset as fallback for match.index', () => {
    const discovery: DiscoverySchema = {
      match: {
        // Legacy offset field - should still work
        offset: 2,
        data: [0x02],
      },
      dimensions: [],
    };

    const result = evaluateDiscovery(discovery, packets, 0);
    expect(result.matched).toBe(true);
  });

  it('should prioritize match.index over legacy match.offset', () => {
    const discovery: DiscoverySchema = {
      match: {
        index: 2,
        offset: 99, // index takes priority, offset is ignored
        data: [0x02],
      },
      dimensions: [],
    };

    const result = evaluateDiscovery(discovery, packets, 0);
    expect(result.matched).toBe(true);
  });

  it('should handle undefined defaultOffset as 0', () => {
    const discovery: DiscoverySchema = {
      match: {
        // No index, no defaultOffset -> index 0. Should match 'B0'
        data: [0xb0],
      },
      dimensions: [],
    };

    const result = evaluateDiscovery(discovery, packets, undefined);
    expect(result.matched).toBe(true);
  });

  it('should handle undefined dimensions smoothly', () => {
    const discovery: DiscoverySchema = {
      match: {
        data: [0xb0],
      },
      // dimensions explicitly undefined
      dimensions: undefined as any,
    };

    const result = evaluateDiscovery(discovery, packets, 0);
    expect(result.matched).toBe(true);
    expect(result.parameterValues).toEqual({});
  });

  it('should extract dimension value using index field', () => {
    const discovery: DiscoverySchema = {
      match: { data: [0xb0] },
      dimensions: [{ parameter: 'count', index: 2 }],
      inference: { strategy: 'max' },
    };

    const result = evaluateDiscovery(discovery, packets, 0);
    expect(result.matched).toBe(true);
    expect(result.parameterValues.count).toBe(0x02);
  });

  it('should extract dimension value using legacy offset field', () => {
    const discovery: DiscoverySchema = {
      match: { data: [0xb0] },
      dimensions: [{ parameter: 'count', offset: 2 } as any],
      inference: { strategy: 'max' },
    };

    const result = evaluateDiscovery(discovery, packets, 0);
    expect(result.matched).toBe(true);
    expect(result.parameterValues.count).toBe(0x02);
  });
});
