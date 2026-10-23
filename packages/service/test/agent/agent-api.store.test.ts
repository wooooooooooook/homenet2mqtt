import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

vi.mock('@rs485-homenet/core', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { AgentApiStore, DEFAULT_AGENT_API_PORT } from '../../src/agent/agent-api.store.js';

// base64url drops padding: ceil(32 / 3) * 4 - 1 = 43 characters.
const TOKEN_PLAINTEXT_LENGTH = 43;

describe('agent api store', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'h2m-agent-store-'));
    filePath = path.join(tempDir, 'agent-api.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('treats a missing file as an empty, available store', async () => {
    const store = new AgentApiStore(filePath, { envEnabled: true });
    await store.load();

    expect(store.unavailable()).toBe(false);
    expect(store.hasToken()).toBe(false);
    expect(store.isReady()).toBe(false);
    expect(store.disabledReason()).toBe('no_token');
    expect(store.getDesiredPort()).toBe(DEFAULT_AGENT_API_PORT);
  });

  it('never persists the plaintext token and stores a sha256 digest', async () => {
    const store = new AgentApiStore(filePath, { envEnabled: true });
    await store.load();
    const token = await store.generateToken();

    expect(token).toHaveLength(TOKEN_PLAINTEXT_LENGTH);
    const raw = await fs.readFile(filePath, 'utf8');
    expect(raw).not.toContain(token);

    const record = JSON.parse(raw);
    expect(record.mode).toBe('sha256');
    expect(Buffer.from(record.tokenHash, 'base64')).toHaveLength(32);
  });

  it('restricts the file to mode 0600', async () => {
    const store = new AgentApiStore(filePath, { envEnabled: true });
    await store.load();
    await store.generateToken();

    const stat = await fs.stat(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('rejects writes and reports unavailability when the file is corrupted', async () => {
    await fs.writeFile(filePath, '{not json', 'utf8');
    const store = new AgentApiStore(filePath, { envEnabled: true });
    await store.load();

    expect(store.unavailable()).toBe(true);
    expect(store.isReady()).toBe(false);
    expect(store.disabledReason()).toBe('store_unavailable');
    await expect(store.generateToken()).rejects.toThrow();
  });

  it('rotates the token hash and invalidates the cached digest', async () => {
    const store = new AgentApiStore(filePath, { envEnabled: true });
    await store.load();

    const first = await store.generateToken();
    const firstHash = store.getTokenHash()?.toString('base64');
    const second = await store.generateToken();
    const secondHash = store.getTokenHash()?.toString('base64');

    expect(first).not.toBe(second);
    expect(firstHash).not.toBe(secondHash);
  });

  it('rejects an out-of-range port', async () => {
    const store = new AgentApiStore(filePath, { envEnabled: true });
    await store.load();

    await expect(store.setPort(0)).rejects.toThrow(RangeError);
    await expect(store.setPort(70000)).rejects.toThrow(RangeError);
    expect(store.getDesiredPort()).toBe(DEFAULT_AGENT_API_PORT);
  });

  it('reloads persisted settings from disk', async () => {
    const store = new AgentApiStore(filePath, { envEnabled: true });
    await store.load();
    await store.generateToken();
    await store.setPort(3211);
    await store.setAllowPacketSend(true);

    const reloaded = new AgentApiStore(filePath, { envEnabled: true });
    await reloaded.load();

    expect(reloaded.unavailable()).toBe(false);
    expect(reloaded.hasToken()).toBe(true);
    expect(reloaded.getDesiredPort()).toBe(3211);
    expect(reloaded.getAllowPacketSend()).toBe(true);
    expect(reloaded.getTokenHash()?.toString('base64')).toBe(
      store.getTokenHash()?.toString('base64'),
    );
  });
});
