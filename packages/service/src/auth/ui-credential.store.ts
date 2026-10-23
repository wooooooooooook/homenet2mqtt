import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@rs485-homenet/core';

export const MIN_UI_PASSWORD_LENGTH = 8;
export const MAX_UI_PASSWORD_LENGTH = 1024;
export const UI_SETUP_WINDOW_MS = 15 * 60 * 1000;

export interface UiCredentialStoreOptions {
  setupWindowMs?: number | null;
  now?: () => number;
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEM = 64 * 1024 * 1024;
const SALT_LENGTH = 16;

interface UiCredentialRecord {
  version: 1;
  algorithm: 'scrypt';
  salt: string;
  hash: string;
  updatedAt: string;
}

export function isValidUiPassword(password: unknown): password is string {
  return (
    typeof password === 'string' &&
    password.length >= MIN_UI_PASSWORD_LENGTH &&
    password.length <= MAX_UI_PASSWORD_LENGTH
  );
}

function deriveKey(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEM },
      (err, key) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(key);
      },
    );
  });
}

function parseRecord(value: unknown): UiCredentialRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<UiCredentialRecord>;
  if (record.version !== 1 || record.algorithm !== 'scrypt') return null;
  if (typeof record.salt !== 'string' || typeof record.hash !== 'string') return null;
  if (typeof record.updatedAt !== 'string') return null;

  const salt = Buffer.from(record.salt, 'base64');
  const hash = Buffer.from(record.hash, 'base64');
  if (salt.length < SALT_LENGTH || hash.length < SCRYPT_KEY_LENGTH) return null;

  return record as UiCredentialRecord;
}

export class UiCredentialStore {
  private record: UiCredentialRecord | null = null;
  private unavailableState = false;
  private setupDeadline: number | null;
  private readonly setupWindowMs: number | null;
  private readonly now: () => number;

  constructor(
    private readonly filePath: string,
    options: UiCredentialStoreOptions = {},
  ) {
    this.setupWindowMs = options.setupWindowMs ?? null;
    this.now = options.now ?? Date.now;
    this.setupDeadline = this.setupWindowMs === null ? null : this.now() + this.setupWindowMs;
  }

  get configured(): boolean {
    return this.record !== null;
  }

  get unavailable(): boolean {
    return this.unavailableState;
  }

  get setupExpired(): boolean {
    return (
      this.record === null &&
      !this.unavailableState &&
      this.setupDeadline !== null &&
      this.now() >= this.setupDeadline
    );
  }

  async load(): Promise<void> {
    this.record = null;
    this.unavailableState = false;
    let content: string;
    try {
      content = await fs.readFile(this.filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.unavailableState = true;
      this.setupDeadline = null;
      logger.error(
        { err, filePath: this.filePath },
        '[service] Failed to read UI auth file. Authentication fails closed until the file is repaired or removed.',
      );
      return;
    }

    try {
      const parsed = parseRecord(JSON.parse(content));
      if (!parsed) {
        throw new Error('Invalid UI auth file structure');
      }
      this.record = parsed;
      this.setupDeadline = null;
    } catch (err) {
      this.unavailableState = true;
      this.setupDeadline = null;
      logger.error(
        { err, filePath: this.filePath },
        '[service] Failed to parse UI auth file. Authentication fails closed until the file is repaired or removed.',
      );
    }
  }

  async setPassword(password: string): Promise<void> {
    if (!isValidUiPassword(password)) {
      throw new Error('UI password does not meet the required policy.');
    }
    if (this.record === null && this.setupExpired) {
      throw new Error('The UI password setup window has expired.');
    }

    const salt = randomBytes(SALT_LENGTH);
    const hash = await deriveKey(password, salt, SCRYPT_KEY_LENGTH);
    const record: UiCredentialRecord = {
      version: 1,
      algorithm: 'scrypt',
      salt: salt.toString('base64'),
      hash: hash.toString('base64'),
      updatedAt: new Date().toISOString(),
    };

    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

    try {
      await fs.writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.chmod(tempPath, 0o600);
      await fs.rename(tempPath, this.filePath);
      await fs.chmod(this.filePath, 0o600);
    } catch (err) {
      await fs.unlink(tempPath).catch(() => undefined);
      throw err;
    }

    this.record = record;
    this.unavailableState = false;
    this.setupDeadline = null;
  }

  async verifyPassword(password: unknown): Promise<boolean> {
    const record = this.record;
    if (!record) return false;
    if (
      typeof password !== 'string' ||
      password.length === 0 ||
      password.length > MAX_UI_PASSWORD_LENGTH
    ) {
      return false;
    }

    const salt = Buffer.from(record.salt, 'base64');
    const expectedHash = Buffer.from(record.hash, 'base64');

    try {
      const providedHash = await deriveKey(password, salt, expectedHash.length);
      return (
        providedHash.length === expectedHash.length && timingSafeEqual(providedHash, expectedHash)
      );
    } catch (err) {
      logger.warn({ err }, '[service] Failed to verify UI password.');
      return false;
    }
  }
}
