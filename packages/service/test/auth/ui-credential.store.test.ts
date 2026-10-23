import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_UI_PASSWORD_LENGTH,
  MIN_UI_PASSWORD_LENGTH,
  UI_SETUP_WINDOW_MS,
  UiCredentialStore,
  isValidUiPassword,
} from '../../src/auth/ui-credential.store.js';

describe('UiCredentialStore', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'h2m-ui-credential-'));
    filePath = path.join(tempDir, 'nested', 'ui-auth.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('treats a missing file as unconfigured', async () => {
    const store = new UiCredentialStore(filePath);
    await store.load();

    expect(store.configured).toBe(false);
    expect(store.unavailable).toBe(false);
    await expect(store.verifyPassword('password123')).resolves.toBe(false);
  });

  it('expires the initial setup window after the configured duration', async () => {
    let now = 1_000;
    const store = new UiCredentialStore(filePath, {
      setupWindowMs: 60_000,
      now: () => now,
    });
    await store.load();

    expect(store.setupExpired).toBe(false);

    now += 59_999;
    expect(store.setupExpired).toBe(false);

    now += 1;
    expect(store.setupExpired).toBe(true);
    await expect(store.setPassword('password123')).rejects.toThrow(/expired/);
    expect(store.configured).toBe(false);
    await expect(fs.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('uses the 15 minute default setup window constant', () => {
    expect(UI_SETUP_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it('allows setup indefinitely when no window is configured', async () => {
    let now = 0;
    const store = new UiCredentialStore(filePath, { now: () => now });
    await store.load();

    now = 10 * UI_SETUP_WINDOW_MS;
    expect(store.setupExpired).toBe(false);
    await store.setPassword('password123');
    expect(store.configured).toBe(true);
  });

  it('does not expire once a password is configured', async () => {
    let now = 0;
    const store = new UiCredentialStore(filePath, {
      setupWindowMs: 1_000,
      now: () => now,
    });
    await store.load();
    await store.setPassword('password123');

    now = 5_000;
    expect(store.setupExpired).toBe(false);
    await expect(store.setPassword('password456')).resolves.toBeUndefined();
    await expect(store.verifyPassword('password456')).resolves.toBe(true);
  });

  it('does not expire when an existing credential file is loaded', async () => {
    const writer = new UiCredentialStore(filePath);
    await writer.load();
    await writer.setPassword('password123');

    let now = 0;
    const store = new UiCredentialStore(filePath, {
      setupWindowMs: 1_000,
      now: () => now,
    });
    await store.load();
    now = 10_000;

    expect(store.configured).toBe(true);
    expect(store.setupExpired).toBe(false);
  });

  it('starts a new setup window when the store is recreated', async () => {
    let now = 0;
    const first = new UiCredentialStore(filePath, {
      setupWindowMs: 1_000,
      now: () => now,
    });
    await first.load();

    now = 1_000;
    expect(first.setupExpired).toBe(true);

    const restarted = new UiCredentialStore(filePath, {
      setupWindowMs: 1_000,
      now: () => now,
    });
    await restarted.load();

    expect(restarted.setupExpired).toBe(false);
    await expect(restarted.setPassword('password123')).resolves.toBeUndefined();
  });

  it('stores a scrypt hash without the plaintext password', async () => {
    const store = new UiCredentialStore(filePath);
    await store.load();
    await store.setPassword('correct horse battery');

    const raw = await fs.readFile(filePath, 'utf8');
    const record = JSON.parse(raw);

    expect(store.configured).toBe(true);
    expect(record.version).toBe(1);
    expect(record.algorithm).toBe('scrypt');
    expect(typeof record.salt).toBe('string');
    expect(typeof record.hash).toBe('string');
    expect(record.updatedAt).toEqual(expect.any(String));
    expect(raw).not.toContain('correct horse battery');
    expect(raw).not.toContain(Buffer.from('correct horse battery').toString('base64'));
  });

  it('writes the credential file with mode 0600', async () => {
    const store = new UiCredentialStore(filePath);
    await store.load();
    await store.setPassword('password123');

    const stat = await fs.stat(filePath);
    expect(stat.mode & 0o777).toBe(0o600);

    const directoryEntries = await fs.readdir(path.dirname(filePath));
    expect(directoryEntries).toEqual(['ui-auth.json']);
  });

  it('verifies the correct password after reloading from disk', async () => {
    const first = new UiCredentialStore(filePath);
    await first.load();
    await first.setPassword('password123');

    const second = new UiCredentialStore(filePath);
    await second.load();

    expect(second.configured).toBe(true);
    await expect(second.verifyPassword('password123')).resolves.toBe(true);
    await expect(second.verifyPassword('password124')).resolves.toBe(false);
    await expect(second.verifyPassword('')).resolves.toBe(false);
    await expect(second.verifyPassword(null)).resolves.toBe(false);
    await expect(second.verifyPassword('x'.repeat(MAX_UI_PASSWORD_LENGTH + 1))).resolves.toBe(
      false,
    );
  });

  it('replaces the existing password on subsequent writes', async () => {
    const store = new UiCredentialStore(filePath);
    await store.load();
    await store.setPassword('password123');
    const before = await fs.readFile(filePath, 'utf8');

    await store.setPassword('password456');
    const after = await fs.readFile(filePath, 'utf8');

    expect(after).not.toBe(before);
    await expect(store.verifyPassword('password123')).resolves.toBe(false);
    await expect(store.verifyPassword('password456')).resolves.toBe(true);
  });

  it('rejects passwords that violate the policy', async () => {
    const store = new UiCredentialStore(filePath);
    await store.load();

    await expect(store.setPassword('short')).rejects.toThrow(/policy/);
    await expect(store.setPassword('x'.repeat(MAX_UI_PASSWORD_LENGTH + 1))).rejects.toThrow(
      /policy/,
    );
    await expect(store.setPassword(12345678 as unknown as string)).rejects.toThrow(/policy/);
    expect(store.configured).toBe(false);
    await expect(fs.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails closed when the file is corrupt', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '{not json', 'utf8');

    const store = new UiCredentialStore(filePath);
    await store.load();

    expect(store.configured).toBe(false);
    expect(store.unavailable).toBe(true);
    await expect(store.verifyPassword('password123')).resolves.toBe(false);
  });

  it('reports unavailable rather than expired when the file is corrupt', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '{not json', 'utf8');

    let now = 0;
    const store = new UiCredentialStore(filePath, {
      setupWindowMs: 1_000,
      now: () => now,
    });
    await store.load();
    now = 2_000;

    expect(store.unavailable).toBe(true);
    expect(store.setupExpired).toBe(false);
  });

  it('fails closed when the file is structurally invalid', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({ version: 2, algorithm: 'plain', salt: 'a', hash: 'b' }),
      'utf8',
    );

    const store = new UiCredentialStore(filePath);
    await store.load();

    expect(store.configured).toBe(false);
    expect(store.unavailable).toBe(true);
  });

  it('recovers after a successful password save', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '{not json', 'utf8');

    const store = new UiCredentialStore(filePath);
    await store.load();
    await store.setPassword('password123');

    expect(store.configured).toBe(true);
    expect(store.unavailable).toBe(false);
    await expect(store.verifyPassword('password123')).resolves.toBe(true);
  });

  it.skipIf(process.getuid?.() === 0)('fails closed when the file is unreadable', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ version: 1 }), 'utf8');
    await fs.chmod(filePath, 0o000);

    try {
      const store = new UiCredentialStore(filePath);
      await store.load();

      expect(store.configured).toBe(false);
      expect(store.unavailable).toBe(true);
    } finally {
      await fs.chmod(filePath, 0o600);
    }
  });

  it.skipIf(process.getuid?.() === 0)(
    'keeps the current password when saving a new one fails',
    async () => {
      const store = new UiCredentialStore(filePath);
      await store.load();
      await store.setPassword('password123');

      const directory = path.dirname(filePath);
      await fs.chmod(directory, 0o500);
      try {
        await expect(store.setPassword('password456')).rejects.toThrow();
      } finally {
        await fs.chmod(directory, 0o700);
      }

      await expect(store.verifyPassword('password123')).resolves.toBe(true);
      await expect(store.verifyPassword('password456')).resolves.toBe(false);
    },
  );

  it('validates the password policy', () => {
    expect(isValidUiPassword('x'.repeat(MIN_UI_PASSWORD_LENGTH))).toBe(true);
    expect(isValidUiPassword('x'.repeat(MAX_UI_PASSWORD_LENGTH))).toBe(true);
    expect(isValidUiPassword('x'.repeat(MIN_UI_PASSWORD_LENGTH - 1))).toBe(false);
    expect(isValidUiPassword('x'.repeat(MAX_UI_PASSWORD_LENGTH + 1))).toBe(false);
    expect(isValidUiPassword(undefined)).toBe(false);
  });
});
