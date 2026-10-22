import { createHash, randomBytes } from 'node:crypto';

export const UI_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const UI_SESSION_MAX_COUNT = 100;

export interface UiSessionStoreOptions {
  ttlMs?: number;
  maxSessions?: number;
  cleanupIntervalMs?: number;
  now?: () => number;
}

interface UiSessionRecord {
  expiresAt: number;
}

export class UiSessionStore {
  private readonly sessions = new Map<string, UiSessionRecord>();
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly now: () => number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: UiSessionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? UI_SESSION_TTL_MS;
    this.maxSessions = options.maxSessions ?? UI_SESSION_MAX_COUNT;
    this.now = options.now ?? Date.now;

    const cleanupIntervalMs = options.cleanupIntervalMs ?? 60 * 1000;
    if (cleanupIntervalMs > 0) {
      this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
      this.cleanupInterval.unref();
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  create(): string {
    const now = this.now();
    this.cleanup();

    while (this.sessions.size >= this.maxSessions) {
      const oldestKey = this.sessions.keys().next().value;
      if (!oldestKey) break;
      this.sessions.delete(oldestKey);
    }

    const token = randomBytes(32).toString('base64url');
    this.sessions.set(this.hashToken(token), { expiresAt: now + this.ttlMs });
    return token;
  }

  validate(token: unknown): boolean {
    if (typeof token !== 'string' || token.length === 0) return false;

    const key = this.hashToken(token);
    const record = this.sessions.get(key);
    if (!record) return false;

    if (this.now() >= record.expiresAt) {
      this.sessions.delete(key);
      return false;
    }

    return true;
  }

  revoke(token: unknown): void {
    if (typeof token !== 'string' || token.length === 0) return;
    this.sessions.delete(this.hashToken(token));
  }

  revokeAll(): void {
    this.sessions.clear();
  }

  cleanup(): void {
    const now = this.now();
    for (const [key, record] of this.sessions.entries()) {
      if (now >= record.expiresAt) {
        this.sessions.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  get size(): number {
    return this.sessions.size;
  }
}
