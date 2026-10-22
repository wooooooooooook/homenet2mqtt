import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_UI_PASSWORD_LENGTH,
  MIN_UI_PASSWORD_LENGTH,
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
    await expect(store.verifyPassword('password123')).resolves.toBe(false);
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

  it('treats a corrupt file as unconfigured', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '{not json', 'utf8');

    const store = new UiCredentialStore(filePath);
    await store.load();

    expect(store.configured).toBe(false);
    await expect(store.verifyPassword('password123')).resolves.toBe(false);
  });

  it('treats a structurally invalid file as unconfigured', async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({ version: 2, algorithm: 'plain', salt: 'a', hash: 'b' }),
      'utf8',
    );

    const store = new UiCredentialStore(filePath);
    await store.load();

    expect(store.configured).toBe(false);
  });

  it('validates the password policy', () => {
    expect(isValidUiPassword('x'.repeat(MIN_UI_PASSWORD_LENGTH))).toBe(true);
    expect(isValidUiPassword('x'.repeat(MAX_UI_PASSWORD_LENGTH))).toBe(true);
    expect(isValidUiPassword('x'.repeat(MIN_UI_PASSWORD_LENGTH - 1))).toBe(false);
    expect(isValidUiPassword('x'.repeat(MAX_UI_PASSWORD_LENGTH + 1))).toBe(false);
    expect(isValidUiPassword(undefined)).toBe(false);
  });
});
