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

    it('should retry asynchronously on transaction conflict and eventually succeed', async () => {
      let failCount = 2;
      const targetState = {
        _onOff: false,
        get onOff(): boolean {
          return this._onOff;
        },
        set onOff(value: boolean) {
          if (failCount > 0) {
            failCount--;
            throw new Error('synchronous-transaction-conflict');
          }
          this._onOff = value;
        },
      };

      const actualPatch = applyPatchState(targetState, { onOff: true });

      expect(actualPatch).toEqual({ onOff: true });
      expect(targetState._onOff).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(targetState._onOff).toBe(true);
      expect(failCount).toBe(0);
    });

    it('should give up after MAX_RETRY_COUNT retries on persistent conflict', async () => {
      let failCount = 30;
      const targetState = {
        _onOff: false,
        get onOff(): boolean {
          return this._onOff;
        },
        set onOff(value: boolean) {
          if (failCount > 0) {
            failCount--;
            throw new Error('synchronous-transaction-conflict');
          }
          this._onOff = value;
        },
      };

      applyPatchState(targetState, { onOff: true });

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(targetState._onOff).toBe(false);
      expect(failCount).toBe(9);
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
