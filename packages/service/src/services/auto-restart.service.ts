import type { FrontendSettings } from '../types/index.js';

export type AutoRestartFault = {
  key: string;
  reason: string;
  portId?: string;
};

export type AutoRestartSettings = NonNullable<FrontendSettings['autoRestart']>;

export type AutoRestartServiceOptions = {
  loadSettings: () => Promise<FrontendSettings> | FrontendSettings;
  triggerRestart: () => Promise<void> | void;
  restartProcess: () => void;
  logger: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
  };
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

type ScheduledRestart = {
  timer: ReturnType<typeof setTimeout>;
  fault: AutoRestartFault;
  dueAt: number;
};

const DEFAULT_TIMEOUT_MINUTES = 5;

export class AutoRestartService {
  private readonly options: AutoRestartServiceOptions;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;
  private readonly scheduled = new Map<string, ScheduledRestart>();

  constructor(options: AutoRestartServiceOptions) {
    this.options = options;
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  }

  async schedule(fault: AutoRestartFault): Promise<void> {
    if (this.scheduled.has(fault.key)) {
      return;
    }

    const settings = await this.resolveSettings();
    if (!settings.enabled || settings.timeoutMinutes <= 0) {
      this.options.logger.info(
        { fault, settings },
        '[service] Auto restart is disabled; skipping restart schedule',
      );
      return;
    }

    const delayMs = settings.timeoutMinutes * 60 * 1000;
    const dueAt = Date.now() + delayMs;
    const timer = this.setTimeoutFn(() => {
      void this.executeRestart(fault);
    }, delayMs);

    this.scheduled.set(fault.key, { timer, fault, dueAt });
    this.options.logger.warn(
      { fault, timeoutMinutes: settings.timeoutMinutes, dueAt: new Date(dueAt).toISOString() },
      '[service] Auto restart scheduled after persistent bridge fault',
    );
  }

  clear(key: string): void {
    const scheduled = this.scheduled.get(key);
    if (!scheduled) {
      return;
    }

    this.clearTimeoutFn(scheduled.timer);
    this.scheduled.delete(key);
    this.options.logger.info(
      { fault: scheduled.fault },
      '[service] Auto restart schedule cleared after recovery',
    );
  }

  clearAll(): void {
    for (const key of this.scheduled.keys()) {
      this.clear(key);
    }
  }

  getPending(): Array<AutoRestartFault & { dueAt: number }> {
    return Array.from(this.scheduled.values()).map(({ fault, dueAt }) => ({ ...fault, dueAt }));
  }

  private async resolveSettings(): Promise<AutoRestartSettings> {
    const settings = await this.options.loadSettings();
    return {
      enabled: settings.autoRestart?.enabled ?? true,
      timeoutMinutes: settings.autoRestart?.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES,
    };
  }

  private async executeRestart(fault: AutoRestartFault): Promise<void> {
    this.scheduled.delete(fault.key);
    try {
      const settings = await this.resolveSettings();
      if (!settings.enabled || settings.timeoutMinutes <= 0) {
        this.options.logger.info(
          { fault, settings },
          '[service] Auto restart was disabled before timeout; skipping restart',
        );
        return;
      }

      this.options.logger.warn({ fault }, '[service] Auto restart timeout reached; restarting');
      await this.options.triggerRestart();
      this.options.restartProcess();
    } catch (error) {
      this.options.logger.error({ err: error, fault }, '[service] Failed to execute auto restart');
    }
  }
}
