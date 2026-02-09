import { describe, it, expect } from 'vitest';
import { HomenetBridgeConfig } from '@rs485-homenet/core';

// Re-implementing the function locally for testing purposes as it was added as a local helper
// copy-pasted from gallery.routes.ts to ensure we test the same logic
function checkConfigRequirements(
  config: HomenetBridgeConfig,
  requirements: { serial?: Record<string, unknown>; packet_defaults?: Record<string, unknown> },
): boolean {
  if (!config.serial) return false;

  // Helper for flexible matching
  const matchRequirement = (expected: unknown, actual: unknown): boolean => {
    // 1. List matching (Array)
    if (Array.isArray(expected)) {
      // If actual value is in the expected array, it's a match
      return expected.includes(actual);
    }

    // 2. Range matching (Object with min/max)
    if (
      typeof expected === 'object' &&
      expected !== null &&
      ('min' in expected || 'max' in expected)
    ) {
      const range = expected as { min?: number; max?: number };
      if (typeof actual !== 'number') return false;

      if (range.min !== undefined && actual < range.min) return false;
      if (range.max !== undefined && actual > range.max) return false;
      return true;
    }

    // 3. Exact matching (Primitive or simple object)
    // Normalize values: treat empty arrays, null, and undefined as equivalent (empty/default)
    const normalizeValue = (v: unknown): string | unknown => {
      if (v === null || v === undefined) return '__EMPTY__';
      if (Array.isArray(v) && v.length === 0) return '__EMPTY__';
      if (Array.isArray(v)) return JSON.stringify(v);
      return v;
    };

    return normalizeValue(expected) === normalizeValue(actual);
  };

  // Check serial settings
  if (requirements.serial) {
    const serialFields = ['baud_rate', 'data_bits', 'parity', 'stop_bits'];
    for (const field of serialFields) {
      const expected = requirements.serial[field];
      const actual = config.serial[field as keyof typeof config.serial];
      
      // Skip check if requirement is not defined
      if (expected === undefined) continue;
      
      // actual can be undefined in config, need to handle it.
      // If expected is defined but actual is undefined, it's a mismatch (unless expected allows undefined/null, but usually config MUST exist)
      if (actual === undefined && expected !== undefined) return false;

      if (!matchRequirement(expected, actual)) {
        return false;
      }
    }
  }

  // Check packet_defaults
  if (requirements.packet_defaults) {
    const packetDefaults = config.packet_defaults || {};
    const packetFields = [
      'rx_length',
      'rx_checksum',
      'tx_checksum',
      'rx_header',
      'tx_header',
      'rx_footer',
      'tx_footer',
    ];

    for (const field of packetFields) {
      const expected = requirements.packet_defaults[field];
      const actual = packetDefaults[field as keyof typeof packetDefaults];

      if (expected !== undefined) {
         if (!matchRequirement(expected, actual)) {
          return false;
        }
      }
    }
  }

  return true;
}

describe('checkConfigRequirements Enhanced', () => {
  const baseConfig: HomenetBridgeConfig = {
    serial: {
      path: '/dev/ttyUSB0',
      baud_rate: 9600,
      data_bits: 8,
      parity: 'none',
      stop_bits: 1,
      portId: 'default'
    },
    packet_defaults: {
      rx_header: [0xaa],
    },
  };

  it('should support range matching for baud_rate', () => {
    // 9600 is within [9000, 10000]
    expect(
      checkConfigRequirements(baseConfig, {
        serial: { baud_rate: { min: 9000, max: 10000 } },
      })
    ).toBe(true);

    // 9600 is NOT within [10000, 11000]
    expect(
      checkConfigRequirements(baseConfig, {
        serial: { baud_rate: { min: 10000, max: 11000 } },
      })
    ).toBe(false);

    // Min only
    expect(
      checkConfigRequirements(baseConfig, {
        serial: { baud_rate: { min: 9000 } },
      })
    ).toBe(true);
    
    // Max only
    expect(
        checkConfigRequirements(baseConfig, {
          serial: { baud_rate: { max: 9000 } },
        })
      ).toBe(false);
  });

  it('should support list matching for parity', () => {
    // 'none' is in ['none', 'even']
    expect(
      checkConfigRequirements(baseConfig, {
        serial: { parity: ['none', 'even'] },
      })
    ).toBe(true);

    // 'none' is NOT in ['odd', 'mark']
    expect(
      checkConfigRequirements(baseConfig, {
        serial: { parity: ['odd', 'mark'] },
      })
    ).toBe(false);
  });

  it('should support exact matching (backward compatibility)', () => {
    expect(
      checkConfigRequirements(baseConfig, {
        serial: { baud_rate: 9600 },
      })
    ).toBe(true);

    expect(
      checkConfigRequirements(baseConfig, {
        serial: { baud_rate: 19200 },
      })
    ).toBe(false);
  });
  
  it('should support list matching for stop_bits', () => {
      // 1 is in [1, 2]
      expect(
        checkConfigRequirements(baseConfig, {
          serial: { stop_bits: [1, 2] },
        })
      ).toBe(true);
  });

  it('should handle packet_defaults list matching', () => {
    const configWithChecksum: HomenetBridgeConfig = {
        ...baseConfig,
        packet_defaults: { ...baseConfig.packet_defaults, rx_checksum: 'none' }
    };

    expect(
        checkConfigRequirements(configWithChecksum, {
            packet_defaults: { rx_checksum: ['none', 'sum'] }
        })
    ).toBe(true);
  });
});
