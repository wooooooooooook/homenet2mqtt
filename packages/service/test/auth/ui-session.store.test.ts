import { describe, it, expect } from 'vitest';
import { UiSessionStore } from '../../src/auth/ui-session.store.js';

describe('UiSessionStore', () => {
  it('creates and validates sessions', () => {
    const store = new UiSessionStore({ cleanupIntervalMs: 0 });
    const token = store.create();

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    expect(store.validate(token)).toBe(true);
    expect(store.validate('unknown-token')).toBe(false);
    expect(store.validate('')).toBe(false);
    expect(store.validate(null)).toBe(false);
    expect(store.size).toBe(1);
  });

  it('issues unique tokens', () => {
    const store = new UiSessionStore({ cleanupIntervalMs: 0 });
    const tokens = new Set(Array.from({ length: 20 }, () => store.create()));

    expect(tokens.size).toBe(20);
    expect(store.size).toBe(20);
  });

  it('revokes a single session', () => {
    const store = new UiSessionStore({ cleanupIntervalMs: 0 });
    const first = store.create();
    const second = store.create();

    store.revoke(first);

    expect(store.validate(first)).toBe(false);
    expect(store.validate(second)).toBe(true);
  });

  it('revokes all sessions', () => {
    const store = new UiSessionStore({ cleanupIntervalMs: 0 });
    const first = store.create();
    const second = store.create();

    store.revokeAll();

    expect(store.size).toBe(0);
    expect(store.validate(first)).toBe(false);
    expect(store.validate(second)).toBe(false);
  });

  it('expires sessions based on the configured clock', () => {
    let now = 1_000;
    const store = new UiSessionStore({
      ttlMs: 500,
      cleanupIntervalMs: 0,
      now: () => now,
    });
    const token = store.create();

    now = 1_499;
    expect(store.validate(token)).toBe(true);

    now = 1_500;
    expect(store.validate(token)).toBe(false);
    expect(store.size).toBe(0);
  });

  it('cleans up expired sessions without validating them', () => {
    let now = 1_000;
    const store = new UiSessionStore({
      ttlMs: 100,
      cleanupIntervalMs: 0,
      now: () => now,
    });
    store.create();
    store.create();

    now = 1_101;
    store.cleanup();

    expect(store.size).toBe(0);
  });

  it('evicts the oldest session when the session cap is reached', () => {
    const store = new UiSessionStore({ cleanupIntervalMs: 0, maxSessions: 2 });
    const first = store.create();
    const second = store.create();
    const third = store.create();

    expect(store.size).toBe(2);
    expect(store.validate(first)).toBe(false);
    expect(store.validate(second)).toBe(true);
    expect(store.validate(third)).toBe(true);
  });

  it('stops the cleanup interval on destroy', () => {
    const store = new UiSessionStore({ cleanupIntervalMs: 10_000 });
    const token = store.create();

    store.destroy();
    store.destroy();

    expect(store.validate(token)).toBe(true);
  });
});
