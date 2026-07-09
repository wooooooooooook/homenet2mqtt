// packages/core/test/transports/matter/utils.test.ts

import { describe, it, expect } from 'vitest';
import { applyPatchState } from '../../../src/transports/matter/utils/apply-patch-state.js';
import { trimToLength } from '../../../src/transports/matter/utils/trim-to-length.js';
import { transactionIsOffline } from '../../../src/transports/matter/utils/transaction-is-offline.js';

describe('Matter Transports Utilities', () => {
  describe('applyPatchState', () => {
    it('should patch only different attributes and return the actual patch', () => {
      const state = {
        onOff: false,
        brightness: 100,
      };

      const actualPatch = applyPatchState(state, {
        onOff: true,
        brightness: 100, // unchanged
      });

      expect(actualPatch).toEqual({ onOff: true });
      expect(state.onOff).toBe(true);
      expect(state.brightness).toBe(100);
    });

    it('should return empty object if nothing changes', () => {
      const state = {
        onOff: true,
        brightness: 200,
      };

      const actualPatch = applyPatchState(state, {
        onOff: true,
        brightness: 200,
      });

      expect(actualPatch).toEqual({});
    });
  });

  describe('trimToLength', () => {
    it('should return the original string if under length', () => {
      expect(trimToLength('hello', 10)).toBe('hello');
    });

    it('should trim string and append suffix if over length', () => {
      expect(trimToLength('hello world', 5)).toBe('he...');
    });

    it('should return undefined if undefined/null', () => {
      expect(trimToLength(undefined, 5)).toBeUndefined();
      expect(trimToLength(null, 5)).toBeUndefined();
    });

    it('should return empty string if empty', () => {
      expect(trimToLength('', 5)).toBe('');
    });
  });

  describe('transactionIsOffline', () => {
    it('should return true if context is undefined or null', () => {
      expect(transactionIsOffline(undefined)).toBe(true);
      expect(transactionIsOffline(null)).toBe(true);
    });
  });
});
