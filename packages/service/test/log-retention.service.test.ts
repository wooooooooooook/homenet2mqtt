import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { LogRetentionService } from '../src/log-retention.service.js';

const mocks = vi.hoisted(() => {
  return {
    eventBus: {
      on: vi.fn(),
      emit: vi.fn(),
      off: vi.fn(),
    },
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock('@rs485-homenet/core', () => ({
  eventBus: mocks.eventBus,
  logger: mocks.logger,
}));

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ size: 100, birthtime: new Date() }),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('LogRetentionService', () => {
  let service: LogRetentionService;
  const configDir = '/tmp/config';

  beforeEach(() => {
    vi.useFakeTimers();
    service = new LogRetentionService(configDir);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should be initialized with default values', () => {
    expect(service.isEnabled()).toBe(true);
    const settings = service.getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.autoSaveEnabled).toBe(false);
    expect(settings.retentionCount).toBe(7);
    expect(settings.ttlHours).toBe(1);
  });

  describe('init', () => {
    it('should setup listeners if enabled', async () => {
      await service.init();
      expect(mocks.eventBus.on).toHaveBeenCalledWith('parsed-packet', expect.any(Function));
      expect(mocks.eventBus.on).toHaveBeenCalledWith('command-packet', expect.any(Function));
    });

    it('should not setup listeners if disabled', async () => {
      await service.init({ enabled: false });
      expect(mocks.eventBus.on).not.toHaveBeenCalled();
      expect(service.isEnabled()).toBe(false);
    });

    it('should start auto-save if enabled', async () => {
      const spy = vi.spyOn(global, 'setInterval');
      await service.init({ autoSaveEnabled: true });
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('updateSettings', () => {
    it('should update enabled state and listeners', async () => {
      await service.init();
      expect(mocks.eventBus.on).toHaveBeenCalled();

      await service.updateSettings({ enabled: false });
      expect(mocks.eventBus.off).toHaveBeenCalled();
      expect(service.isEnabled()).toBe(false);

      await service.updateSettings({ enabled: true });
      expect(mocks.eventBus.on).toHaveBeenCalledTimes(8); // 4 in init, 4 in updateSettings
    });

    it('should update auto-save state', async () => {
      await service.init();
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      await service.updateSettings({ autoSaveEnabled: true });
      expect(setIntervalSpy).toHaveBeenCalled();

      await service.updateSettings({ autoSaveEnabled: false });
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('Event Handling and History', () => {
    let handlers: Record<string, Function> = {};

    beforeEach(async () => {
      handlers = {};
      mocks.eventBus.on.mockImplementation((event: string, handler: Function) => {
        handlers[event] = handler;
      });
      await service.init();
    });

    it('should store parsed packets', () => {
      const pkt = {
        packet: 'AABB',
        entityId: 'light.test',
        state: 'on',
        portId: 'port1',
      };
      handlers['parsed-packet'](pkt);

      const history = service.getParsedPacketHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        entityId: 'light.test',
        packet: 'AABB',
        state: 'on',
        portId: 'port1',
      });
    });

    it('should store command packets', () => {
      const pkt = {
        packet: 'CCDD',
        entityId: 'light.test',
        command: 'turn_on',
        value: 255,
        portId: 'port1',
      };
      handlers['command-packet'](pkt);

      const history = service.getCommandPacketHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        entityId: 'light.test',
        packet: 'CCDD',
        command: 'turn_on',
        value: 255,
        portId: 'port1',
      });
    });

    it('should store unmatched packets', () => {
      handlers['unmatched-packet']({ packet: 'EEEE', portId: 'port1' });
      handlers['unmatched-packet']({ packet: 'FFFF', portId: 'port1' });

      const unmatched = service.getUnmatchedPackets('port1');
      expect(unmatched).toContain('EEEE');
      expect(unmatched).toContain('FFFF');
    });

    it('should return parsed packet entities correctly', () => {
      handlers['parsed-packet']({ packet: 'AABB', entityId: 'light.1' });
      handlers['command-packet']({ packet: 'AABB', entityId: 'light.1', command: 'on' });

      const entities = service.getParsedPacketEntities();
      expect(entities['AABB']).toContain('light.1');
      expect(entities['AABB']).toContain('light.1 (on)');
    });

    it('should filter dictionary by portId', () => {
      handlers['parsed-packet']({ packet: 'AABB', entityId: 'light.1', portId: 'port1' });
      handlers['parsed-packet']({ packet: 'CCDD', entityId: 'light.2', portId: 'port2' });

      const dictPort1 = service.getPacketDictionary('port1');
      expect(Object.values(dictPort1)).toContain('AABB');
      expect(Object.values(dictPort1)).not.toContain('CCDD');
    });
  });

  describe('Cleanup, Stats, and File Operations', () => {
    let handlers: Record<string, Function> = {};

    beforeEach(async () => {
      handlers = {};
      mocks.eventBus.on.mockImplementation((event: string, handler: Function) => {
        handlers[event] = handler;
      });
      await service.init({ ttlHours: 1 });
    });

    it('should cleanup old logs based on TTL', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      handlers['parsed-packet']({ packet: 'OLD', timestamp: new Date(now - 2 * 3600 * 1000).toISOString() });
      handlers['parsed-packet']({ packet: 'NEW', timestamp: new Date(now).toISOString() });

      expect(service.getParsedPacketHistory()).toHaveLength(2);

      // Trigger cleanup (it runs every hour by default, or when triggered manually)
      // Since it's private, we'll advance time to trigger the interval
      await vi.advanceTimersByTimeAsync(3600 * 1000);

      const history = service.getParsedPacketHistory();
      expect(history).toHaveLength(1);
      expect(history[0].packet).toBe('NEW');
    });

    it('should calculate stats correctly', () => {
      handlers['parsed-packet']({ packet: 'P1' });
      handlers['command-packet']({ packet: 'C1' });
      handlers['activity-log:added']({ timestamp: Date.now(), code: 'ACT1' });

      const stats = service.getStats();
      expect(stats.packetLogCount).toBe(2);
      expect(stats.activityLogCount).toBe(1);
      expect(stats.memoryUsageBytes).toBeGreaterThan(0);
    });

    it('should save logs to file', async () => {
      handlers['parsed-packet']({ packet: 'P1' });
      const result = await service.saveToFile();

      expect(fsp.mkdir).toHaveBeenCalled();
      expect(fsp.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('cache_log_'),
        expect.stringContaining('P1'),
        'utf-8'
      );
      expect(result.filename).toMatch(/cache_log_.*\.json/);
    });

    it('should cleanup old files', async () => {
      await service.init({ retentionCount: 2 });

      // Mock readdir to return 3 files
      vi.mocked(fsp.readdir).mockResolvedValue([
        { isFile: () => true, name: 'log1.json' } as any,
        { isFile: () => true, name: 'log2.json' } as any,
        { isFile: () => true, name: 'log3.json' } as any,
      ]);

      // Mock stat to return different birthtimes
      vi.mocked(fsp.stat)
        .mockResolvedValueOnce({ size: 100, birthtime: new Date('2023-01-01') } as any)
        .mockResolvedValueOnce({ size: 100, birthtime: new Date('2023-01-02') } as any)
        .mockResolvedValueOnce({ size: 100, birthtime: new Date('2023-01-03') } as any);

      // Trigger autoSave which calls cleanupOldFiles
      // We need to enable autoSave first
      await service.updateSettings({ autoSaveEnabled: true });

      // Advance time to trigger autoSave
      await vi.advanceTimersByTimeAsync(3600 * 1000);

      expect(fsp.unlink).toHaveBeenCalledWith(expect.stringContaining('log1.json'));
    });

    it('should cleanup files with mode "all"', async () => {
      vi.mocked(fsp.readdir).mockResolvedValue([
        { isFile: () => true, name: 'log1.json' } as any,
      ]);

      const count = await service.cleanupFiles('all');
      expect(count).toBe(1);
      expect(fsp.unlink).toHaveBeenCalled();
    });
  });
});
