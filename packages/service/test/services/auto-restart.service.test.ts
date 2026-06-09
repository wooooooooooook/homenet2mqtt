import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoRestartService } from '../../src/services/auto-restart.service.js';
import type { FrontendSettings } from '../../src/types/index.js';

const makeSettings = (autoRestart: FrontendSettings['autoRestart']): FrontendSettings => ({
  toast: { stateChange: false, command: true },
  autoRestart,
});

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('AutoRestartService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('설정된 장애 지속 시간이 지나면 재시작을 트리거한다', async () => {
    const triggerRestart = vi.fn().mockResolvedValue(undefined);
    const restartProcess = vi.fn();
    const service = new AutoRestartService({
      loadSettings: () => makeSettings({ enabled: true, timeoutMinutes: 5 }),
      triggerRestart,
      restartProcess,
      logger,
    });

    await service.schedule({ key: 'mqtt:default', reason: 'mqtt disconnected' });
    expect(service.getPending()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(triggerRestart).toHaveBeenCalledTimes(1);
    expect(restartProcess).toHaveBeenCalledTimes(1);
    expect(service.getPending()).toHaveLength(0);
  });

  it('복구되면 예약된 자동 재시작을 취소한다', async () => {
    const triggerRestart = vi.fn().mockResolvedValue(undefined);
    const restartProcess = vi.fn();
    const service = new AutoRestartService({
      loadSettings: () => makeSettings({ enabled: true, timeoutMinutes: 5 }),
      triggerRestart,
      restartProcess,
      logger,
    });

    await service.schedule({ key: 'serial:default', reason: 'serial reconnecting' });
    service.clear('serial:default');
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(triggerRestart).not.toHaveBeenCalled();
    expect(restartProcess).not.toHaveBeenCalled();
    expect(service.getPending()).toHaveLength(0);
  });

  it('자동 재시작 설정이 꺼져 있으면 예약하지 않는다', async () => {
    const service = new AutoRestartService({
      loadSettings: () => makeSettings({ enabled: false, timeoutMinutes: 5 }),
      triggerRestart: vi.fn(),
      restartProcess: vi.fn(),
      logger,
    });

    await service.schedule({ key: 'mqtt:default', reason: 'mqtt disconnected' });

    expect(service.getPending()).toHaveLength(0);
  });
});
