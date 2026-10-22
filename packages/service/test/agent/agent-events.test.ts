import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  return {
    handlers,
    emit: (event: string, data: unknown) => {
      for (const handler of handlers.get(event) ?? []) {
        handler(data);
      }
    },
    eventBus: {
      on: vi.fn((event: string, handler: (data: unknown) => void) => {
        let set = handlers.get(event);
        if (!set) {
          set = new Set();
          handlers.set(event, set);
        }
        set.add(handler);
      }),
      off: vi.fn((event: string, handler: (data: unknown) => void) => {
        handlers.get(event)?.delete(handler);
      }),
      emit: vi.fn(),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock('@rs485-homenet/core', () => ({
  eventBus: mocks.eventBus,
  logger: mocks.logger,
}));

import { AgentEventHub, matchesAgentEventFilter } from '../../src/agent/agent-events.service.js';

describe('AgentEventHub', () => {
  let hub: AgentEventHub;

  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    hub = new AgentEventHub(3);
  });

  afterEach(() => {
    hub.stop();
  });

  it('registers event bus handlers once even when started twice', () => {
    hub.start();
    hub.start();
    expect(mocks.eventBus.on).toHaveBeenCalledTimes(8);
    expect(mocks.handlers.get('state:changed')?.size).toBe(1);
  });

  it('publishes normalized events with incrementing ids', () => {
    hub.start();
    mocks.emit('state:changed', {
      entityId: 'lamp',
      portId: 'default',
      timestamp: '2026-01-01T00:00:00.000Z',
      state: { state: 'ON' },
    });
    mocks.emit('parsed-packet', { portId: 'default', packet: 'AA55' });

    const events = hub.getRecent(10);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: 1,
      type: 'state',
      portId: 'default',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(events[1].id).toBe(2);
    expect(events[1].type).toBe('parsed-packet');
  });

  it('filters subscribers by type and port', () => {
    hub.start();
    const received: number[] = [];
    hub.subscribe({ types: new Set(['state']), portId: 'kitchen' }, (event) =>
      received.push(event.id),
    );

    mocks.emit('state:changed', { portId: 'kitchen' });
    mocks.emit('state:changed', { portId: 'office' });
    mocks.emit('parsed-packet', { portId: 'kitchen' });

    expect(received).toEqual([1]);
  });

  it('caps the ring buffer and reports replay gaps', () => {
    hub.start();
    for (let index = 0; index < 5; index += 1) {
      mocks.emit('state:changed', { portId: 'default', seq: index });
    }

    expect(hub.getBufferSize()).toBe(3);
    expect(hub.getOldestEventId()).toBe(3);

    const fromStart = hub.replayAfter(0, {});
    expect(fromStart.gap).toBe(false);
    expect(fromStart.events.map((event) => event.id)).toEqual([3, 4, 5]);

    const gap = hub.replayAfter(1, {});
    expect(gap.gap).toBe(true);
    expect(gap.events.map((event) => event.id)).toEqual([3, 4, 5]);

    const noGap = hub.replayAfter(2, {});
    expect(noGap.gap).toBe(false);
    expect(noGap.events.map((event) => event.id)).toEqual([3, 4, 5]);
  });

  it('filters replay and recent queries', () => {
    hub.start();
    mocks.emit('state:changed', { portId: 'default' });
    mocks.emit('unmatched-packet', { portId: 'default', packet: 'AA' });
    mocks.emit('state:changed', { portId: 'other' });

    const replay = hub.replayAfter(0, { types: new Set(['state']), portId: 'default' });
    expect(replay.events.map((event) => event.id)).toEqual([1]);

    const recent = hub.getRecent(1, { portId: 'other' });
    expect(recent.map((event) => event.id)).toEqual([3]);
  });

  it('normalizes raw packets and applies the raw mode filter', () => {
    hub.start();
    mocks.emit('raw-data-with-interval', { portId: 'default', payload: 'AA55', interval: 12 });
    mocks.emit('raw-valid-packet', { portId: 'default', payload: 'BB66' });
    mocks.emit('raw-tx-packet', { portId: 'default', payload: 'CC77' });

    const events = hub.getRecent(10, { types: new Set(['raw']) });
    expect(events.map((event) => event.data.mode)).toEqual(['all', 'valid', null]);
    expect(events[0]).toMatchObject({
      portId: 'default',
      type: 'raw',
      data: { payload: 'AA55', direction: 'RX', interval: 12 },
    });
    expect(events[2].data.direction).toBe('TX');

    const validOnly = hub.getRecent(10, { types: new Set(['raw']), rawMode: 'valid' });
    // A null mode (TX packets) acts as a wildcard for both raw modes.
    expect(validOnly.map((event) => event.data.payload)).toEqual(['BB66', 'CC77']);
  });

  it('removes handlers, subscribers, and buffer on stop', () => {
    hub.start();
    const listener = vi.fn();
    hub.subscribe({}, listener);
    mocks.emit('state:changed', { portId: 'default' });

    expect(hub.getSubscriberCount()).toBe(1);
    expect(hub.getBufferSize()).toBe(1);

    hub.stop();
    expect(mocks.eventBus.off).toHaveBeenCalledTimes(8);
    expect(hub.getSubscriberCount()).toBe(0);
    expect(hub.getBufferSize()).toBe(0);

    mocks.emit('state:changed', { portId: 'default' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps delivering to other subscribers when one throws', () => {
    hub.start();
    const good = vi.fn();
    hub.subscribe({}, () => {
      throw new Error('boom');
    });
    hub.subscribe({}, good);

    mocks.emit('state:changed', { portId: 'default' });

    expect(good).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalled();
  });
});

describe('matchesAgentEventFilter', () => {
  const event = {
    id: 1,
    type: 'raw' as const,
    timestamp: '2026-01-01T00:00:00.000Z',
    portId: 'default',
    data: { mode: 'valid' as string | null },
  };

  it('matches by type and port', () => {
    expect(matchesAgentEventFilter(event, { types: new Set(['raw']), portId: 'default' })).toBe(
      true,
    );
    expect(matchesAgentEventFilter(event, { types: new Set(['state']) })).toBe(false);
    expect(matchesAgentEventFilter(event, { portId: 'other' })).toBe(false);
  });

  it('matches raw mode with a null mode wildcard', () => {
    expect(matchesAgentEventFilter(event, { rawMode: 'valid' })).toBe(true);
    expect(matchesAgentEventFilter(event, { rawMode: 'all' })).toBe(false);
    expect(matchesAgentEventFilter({ ...event, data: { mode: null } }, { rawMode: 'all' })).toBe(
      true,
    );
  });
});
