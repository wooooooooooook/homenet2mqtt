import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
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

import { createAgentAuthMiddleware } from '../../src/agent/agent-auth.middleware.js';
import { AgentApiStore, DEFAULT_AGENT_API_PORT } from '../../src/agent/agent-api.store.js';

const createApp = (state: AgentApiStore) => {
  const app = express();
  app.get('/protected', createAgentAuthMiddleware(state), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
};

describe('agent auth middleware', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'h2m-agent-auth-'));
    filePath = path.join(tempDir, 'agent-api.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const buildStore = async (envEnabled: boolean): Promise<AgentApiStore> => {
    const store = new AgentApiStore(filePath, { envEnabled });
    await store.load();
    return store;
  };

  it('returns 503 with reason env_disabled when the env toggle is off', async () => {
    const store = await buildStore(false);
    await store.generateToken();

    const response = await request(createApp(store)).get('/protected');

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('AGENT_API_DISABLED');
    expect(response.body.reason).toBe('env_disabled');
  });

  it('returns 503 with reason no_token when enabled but no token exists', async () => {
    const store = await buildStore(true);

    const response = await request(createApp(store)).get('/protected');

    expect(response.status).toBe(503);
    expect(response.body.reason).toBe('no_token');
  });

  it('returns 503 with reason store_unavailable when the file is corrupted', async () => {
    await fs.writeFile(filePath, '{not json', 'utf8');
    const store = await buildStore(true);

    const response = await request(createApp(store)).get('/protected');

    expect(response.status).toBe(503);
    expect(response.body.reason).toBe('store_unavailable');
  });

  it('returns 401 without an Authorization header', async () => {
    const store = await buildStore(true);
    await store.generateToken();

    const response = await request(createApp(store)).get('/protected');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('returns 401 for an invalid token', async () => {
    const store = await buildStore(true);
    await store.generateToken();

    const response = await request(createApp(store))
      .get('/protected')
      .set('Authorization', `Bearer ${'b'.repeat(32)}`);

    expect(response.status).toBe(401);
  });

  it('accepts a valid token case-insensitively on the scheme', async () => {
    const store = await buildStore(true);
    const token = await store.generateToken();

    const response = await request(createApp(store))
      .get('/protected')
      .set('Authorization', `bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('rejects the previous token immediately after rotation, without rebuilding the middleware', async () => {
    const store = await buildStore(true);
    const firstToken = await store.generateToken();
    const app = createApp(store);

    const before = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${firstToken}`);
    expect(before.status).toBe(200);

    const secondToken = await store.generateToken();

    const old = await request(app).get('/protected').set('Authorization', `Bearer ${firstToken}`);
    expect(old.status).toBe(401);

    const fresh = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${secondToken}`);
    expect(fresh.status).toBe(200);
  });

  it('reports the persisted port and packet-send defaults', async () => {
    const store = await buildStore(true);
    expect(store.getDesiredPort()).toBe(DEFAULT_AGENT_API_PORT);
    expect(store.getAllowPacketSend()).toBe(false);
    expect(store.getActualPort()).toBeNull();

    await store.setPort(3120);
    await store.setAllowPacketSend(true);
    expect(store.getDesiredPort()).toBe(3120);
    expect(store.getAllowPacketSend()).toBe(true);

    const reloaded = await buildStore(true);
    expect(reloaded.getDesiredPort()).toBe(3120);
    expect(reloaded.getAllowPacketSend()).toBe(true);
  });
});
