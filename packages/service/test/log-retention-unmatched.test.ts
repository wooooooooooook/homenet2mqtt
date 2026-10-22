import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  return {
    emit: (event: string, data: unknown) => {
      for (const handler of handlers.get(event) ?? []) {
        handler(data);
      }
    },
    handlers,
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

import { LogRetentionService } from '../src/log-retention.service.js';

describe('LogRetentionService unmatched packet details', () => {
  let configDir: string;
  let service: LogRetentionService;

  beforeEach(async () => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-retention-'));
    service = new LogRetentionService(configDir);
    await service.init();
  });

  afterEach(async () => {
    service.destroy();
    vi.useRealTimers();
    await fs.rm(configDir, { recursive: true, force: true });
  });

  it('accumulates counts and first/last seen timestamps', () => {
    mocks.emit('unmatched-packet', {
      packet: 'AA55',
      portId: 'default',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    mocks.emit('unmatched-packet', {
      packet: 'AA55',
      portId: 'default',
      timestamp: '2026-01-01T00:05:00.000Z',
    });
    mocks.emit('unmatched-packet', {
      packet: 'BB66',
      portId: 'default',
      timestamp: '2026-01-01T00:02:00.000Z',
    });

    const details = service.getUnmatchedPacketDetails('default');
    expect(details).toHaveLength(2);
    expect(details[0]).toMatchObject({ packet: 'AA55', portId: 'default', count: 2 });
    expect(details[0].firstSeen).not.toBe(details[0].lastSeen);
    expect(details[1]).toMatchObject({ packet: 'BB66', count: 1 });

    // Legacy getters keep returning unique packet hex values.
    expect(service.getUnmatchedPackets('default').sort()).toEqual(['AA55', 'BB66']);
    expect(service.getUnmatchedPackets()).toEqual(['AA55', 'BB66']);
  });

  it('groups details per port and defaults to unknown', () => {
    mocks.emit('unmatched-packet', { packet: 'AA55', portId: 'default' });
    mocks.emit('unmatched-packet', { packet: 'CC77', portId: 'secondary' });
    mocks.emit('unmatched-packet', { packet: 'DD88' });

    expect(service.getUnmatchedPackets('secondary')).toEqual(['CC77']);
    expect(service.getUnmatchedPacketDetails('secondary')).toEqual([
      expect.objectContaining({ packet: 'CC77', portId: 'secondary' }),
    ]);
    expect(service.getUnmatchedPackets('unknown')).toEqual(['DD88']);
    expect(service.getUnmatchedPacketDetails()).toHaveLength(3);
  });

  it('removes details once the last sighting exceeds the TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    service.destroy();
    service = new LogRetentionService(configDir);
    await service.init({ ttlHours: 1 / 3600 });

    mocks.emit('unmatched-packet', {
      packet: 'AA55',
      portId: 'default',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(service.getUnmatchedPacketDetails('default')).toHaveLength(1);

    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
    await vi.advanceTimersByTimeAsync(6000);

    expect(service.getUnmatchedPacketDetails('default')).toEqual([]);
  });

  it('includes details in saved cache files', async () => {
    mocks.emit('unmatched-packet', {
      packet: 'AA55',
      portId: 'default',
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    const saved = await service.saveToFile();
    const contents = JSON.parse(await fs.readFile(saved.path, 'utf8'));

    expect(contents.validButUnparsedPackets).toEqual({ default: ['AA55'] });
    expect(contents.unmatchedPacketDetails).toEqual([
      expect.objectContaining({ packet: 'AA55', portId: 'default', count: 1 }),
    ]);
  });
});
