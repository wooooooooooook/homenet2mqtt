import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('@rs485-homenet/core', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { createAgentAuthMiddleware } from '../../src/agent/agent-auth.middleware.js';
import { loadAgentApiConfig } from '../../src/agent/agent.config.js';

const createApp = (token: string | null) => {
  const app = express();
  app.get(
    '/protected',
    createAgentAuthMiddleware({
      enabled: Boolean(token),
      token,
      allowPacketSend: false,
      disabledReason: token ? null : 'missing_token',
    }),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  return app;
};

describe('agent auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 503 when the agent API is disabled', async () => {
    const response = await request(createApp(null)).get('/protected');
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('AGENT_API_DISABLED');
  });

  it('returns 401 without an Authorization header', async () => {
    const response = await request(createApp('a'.repeat(32))).get('/protected');
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('returns 401 for an invalid token', async () => {
    const response = await request(createApp('a'.repeat(32)))
      .get('/protected')
      .set('Authorization', `Bearer ${'b'.repeat(32)}`);
    expect(response.status).toBe(401);
  });

  it('accepts a valid token case-insensitively on the scheme', async () => {
    const token = 'a'.repeat(32);
    const response = await request(createApp(token))
      .get('/protected')
      .set('Authorization', `bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

describe('loadAgentApiConfig', () => {
  it('disables the API when no token is configured', () => {
    const config = loadAgentApiConfig({} as NodeJS.ProcessEnv);
    expect(config.enabled).toBe(false);
    expect(config.disabledReason).toBe('missing_token');
  });

  it('disables the API when the token is too short', () => {
    const config = loadAgentApiConfig({ AGENT_API_TOKEN: 'short' } as NodeJS.ProcessEnv);
    expect(config.enabled).toBe(false);
    expect(config.disabledReason).toBe('token_too_short');
  });

  it('enables the API and parses the packet-send opt-in', () => {
    const config = loadAgentApiConfig({
      AGENT_API_TOKEN: 'a'.repeat(16),
      AGENT_ALLOW_PACKET_SEND: 'true',
    } as NodeJS.ProcessEnv);
    expect(config.enabled).toBe(true);
    expect(config.token).toBe('a'.repeat(16));
    expect(config.allowPacketSend).toBe(true);
  });
});
