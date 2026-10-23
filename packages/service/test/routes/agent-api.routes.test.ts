import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

import {
  createAgentApiRoutes,
  type AgentApiRoutesContext,
} from '../../src/routes/agent-api.routes.js';
import { AgentApiStore } from '../../src/agent/agent-api.store.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';

interface Harness {
  app: express.Express;
  store: AgentApiStore;
  triggerRestart: ReturnType<typeof vi.fn>;
}

describe('agent api settings routes', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'h2m-agent-api-routes-'));
    filePath = path.join(tempDir, 'agent-api.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const buildHarness = async (
    options: {
      envEnabled?: boolean;
      portLocked?: boolean;
      uiPort?: number;
      maxRequests?: number;
    } = {},
  ): Promise<Harness> => {
    const store = new AgentApiStore(filePath, { envEnabled: options.envEnabled ?? true });
    await store.load();
    const triggerRestart = vi.fn(async () => undefined);

    const ctx: AgentApiRoutesContext = {
      agentApi: store,
      rateLimiter: new RateLimiter(60_000, options.maxRequests ?? 100),
      getUiPort: () => options.uiPort ?? 3000,
      portLocked: options.portLocked ?? false,
      triggerRestart,
    };

    const app = express();
    app.use(express.json());
    app.use(createAgentApiRoutes(ctx));

    return { app, store, triggerRestart };
  };

  it('masks the token material in the status payload', async () => {
    const { app, store } = await buildHarness();
    const token = await store.generateToken();
    store.setActualPort(3004);

    const response = await request(app).get('/api/agent-api');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      enabled: true,
      ready: true,
      hasToken: true,
      allowPacketSend: false,
      port: 3001,
      actualPort: 3004,
      unavailable: false,
      disabledReason: null,
      portEditable: true,
    });
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(response.body).not.toHaveProperty('tokenHash');
  });

  it('issues a plaintext token exactly once and flags a rotation', async () => {
    const { app } = await buildHarness();

    const first = await request(app).post('/api/agent-api/token');
    expect(first.status).toBe(200);
    expect(first.body.rotated).toBe(false);
    expect(typeof first.body.token).toBe('string');

    const second = await request(app).post('/api/agent-api/token');
    expect(second.body.rotated).toBe(true);
    expect(second.body.token).not.toBe(first.body.token);
  });

  it('applies allowPacketSend immediately without a restart', async () => {
    const { app, store, triggerRestart } = await buildHarness();

    const response = await request(app)
      .put('/api/agent-api/settings')
      .send({ allowPacketSend: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      restartRequired: false,
      port: 3001,
      allowPacketSend: true,
    });
    expect(store.getAllowPacketSend()).toBe(true);
    expect(triggerRestart).not.toHaveBeenCalled();
  });

  it('persists a new port, triggers the restart and reports restartRequired', async () => {
    const { app, store, triggerRestart } = await buildHarness();

    const response = await request(app).put('/api/agent-api/settings').send({ port: 3120 });

    expect(response.status).toBe(200);
    expect(response.body.restartRequired).toBe(true);
    expect(response.body.port).toBe(3120);
    expect(store.getDesiredPort()).toBe(3120);
    expect(triggerRestart).toHaveBeenCalledTimes(1);
  });

  it('does not restart when the requested port is already configured', async () => {
    const { app, store, triggerRestart } = await buildHarness();
    await store.setPort(3120);

    const response = await request(app).put('/api/agent-api/settings').send({ port: 3120 });

    expect(response.status).toBe(200);
    expect(response.body.restartRequired).toBe(false);
    expect(triggerRestart).not.toHaveBeenCalled();
  });

  it.each([['3120'], [3120.5], [-1], [70000]])('rejects an invalid port %p', async (port) => {
    const { app, triggerRestart } = await buildHarness();

    const response = await request(app).put('/api/agent-api/settings').send({ port });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_PORT');
    expect(triggerRestart).not.toHaveBeenCalled();
  });

  it('rejects a port that collides with the UI port', async () => {
    const { app, triggerRestart } = await buildHarness({ uiPort: 3000 });

    const response = await request(app).put('/api/agent-api/settings').send({ port: 3000 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('PORT_CONFLICT');
    expect(triggerRestart).not.toHaveBeenCalled();
  });

  it('refuses port changes while the add-on owns the mapping', async () => {
    const { app, store } = await buildHarness({ portLocked: true });

    const response = await request(app).put('/api/agent-api/settings').send({ port: 3120 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('PORT_MANAGED_BY_ADDON');
    expect(store.getDesiredPort()).toBe(3001);

    const status = await request(app).get('/api/agent-api');
    expect(status.body.portEditable).toBe(false);
  });

  it('rejects a non-boolean allowPacketSend', async () => {
    const { app } = await buildHarness();

    const response = await request(app)
      .put('/api/agent-api/settings')
      .send({ allowPacketSend: 'yes' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_ALLOW_PACKET_SEND');
  });

  it('returns 503 while the store file is corrupted', async () => {
    await fs.writeFile(filePath, '{not json', 'utf8');
    const broken = new AgentApiStore(filePath, { envEnabled: true });
    await broken.load();

    const app = express();
    app.use(express.json());
    app.use(
      createAgentApiRoutes({
        agentApi: broken,
        rateLimiter: new RateLimiter(60_000, 100),
        getUiPort: () => 3000,
        portLocked: false,
        triggerRestart: vi.fn(async () => undefined),
      }),
    );

    const settings = await request(app).put('/api/agent-api/settings').send({ port: 3120 });
    expect(settings.status).toBe(503);
    expect(settings.body.error).toBe('AGENT_API_UNAVAILABLE');

    const token = await request(app).post('/api/agent-api/token');
    expect(token.status).toBe(503);
    expect(token.body.error).toBe('AGENT_API_UNAVAILABLE');

    // Reads stay available so the UI can explain why the Agent API is down.
    const status = await request(app).get('/api/agent-api');
    expect(status.body.unavailable).toBe(true);
    expect(status.body.disabledReason).toBe('store_unavailable');
  });

  it('rate limits token and settings mutations', async () => {
    const { app } = await buildHarness({ maxRequests: 1 });

    const first = await request(app).put('/api/agent-api/settings').send({ allowPacketSend: true });
    expect(first.status).toBe(200);

    const blocked = await request(app).post('/api/agent-api/token');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('RATE_LIMITED');
  });
});
