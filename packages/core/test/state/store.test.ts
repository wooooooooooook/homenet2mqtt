import { describe, it, expect, beforeEach } from 'vitest';
import { getStateCache, clearStateCache, stateCache } from '../../src/state/store.js';

describe('store', () => {
  beforeEach(() => {
    clearStateCache();
  });

  describe('getStateCache', () => {
    it('should return the stateCache Map', () => {
      const cache = getStateCache();
      expect(cache).toBeInstanceOf(Map);
      expect(cache).toBe(stateCache);
    });
  });

  describe('clearStateCache', () => {
    it('should clear all entries from the stateCache', () => {
      stateCache.set('key1', 'value1');
      stateCache.set('key2', { foo: 'bar' });

      expect(stateCache.size).toBe(2);

      clearStateCache();

      expect(stateCache.size).toBe(0);
      expect(getStateCache().size).toBe(0);
    });

    it('should work correctly when the cache is already empty', () => {
      expect(stateCache.size).toBe(0);

      clearStateCache();

      expect(stateCache.size).toBe(0);
    });
  });
});
