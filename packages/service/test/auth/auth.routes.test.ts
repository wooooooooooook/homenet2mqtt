import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { UiCredentialStore } from '../../src/auth/ui-credential.store.js';
import { UiSessionStore } from '../../src/auth/ui-session.store.js';
import { AgentApiStore, DEFAULT_AGENT_API_PORT } from '../../src/agent/agent-api.store.js';
import { UI_SESSION_COOKIE, createUiAuthMiddleware } from '../../src/auth/ui-auth.middleware.js';
import {
  createProtectedAuthRoutes,
  createPublicAuthRoutes,
  type AuthRoutesContext,
} from '../../src/routes/auth.routes.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';

interface Harness {
  app: Express;
  credentials: UiCredentialStore;
  sessions: UiSessionStore;
  rateLimiter: RateLimiter;
  agentApi: AgentApiStore;
}

const INGRESS_HEADER = { 'X-Ingress-Path': '/api/hassio_ingress/token' };
const SUPERVISOR_ADDRESS = '172.30.32.2';
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1']);

const setCookieHeaders = (response: request.Response): string[] => {
  const raw = response.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
};

const readSessionCookie = (response: request.Response): string => {
  const cookie = setCookieHeaders(response).find((value) =>
    value.startsWith(`${UI_SESSION_COOKIE}=`),
  );
  if (!cookie) throw new Error('Session cookie was not set');
  return cookie.split(';')[0];
};

describe('UI auth routes', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'h2m-ui-auth-routes-'));
    filePath = path.join(tempDir, 'ui-auth.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const buildHarness = async (
    options: {
      trustIngress?: boolean;
      maxRequests?: number;
      trustedIngressAddresses?: ReadonlySet<string>;
      corruptAuthFile?: boolean;
      setupWindowMs?: number;
      now?: () => number;
      agentApiEnabled?: boolean;
      portLocked?: boolean;
      uiPort?: number;
    } = {},
  ): Promise<Harness> => {
    if (options.corruptAuthFile) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, '{not json', 'utf8');
    }

    const credentials = new UiCredentialStore(filePath, {
      setupWindowMs: options.setupWindowMs ?? null,
      now: options.now,
    });
    await credentials.load();
    const agentApi = new AgentApiStore(path.join(tempDir, 'agent-api.json'), {
      envEnabled: options.agentApiEnabled ?? false,
    });
    await agentApi.load();
    const sessions = new UiSessionStore({ cleanupIntervalMs: 0 });
    const rateLimiter = new RateLimiter(15 * 60 * 1000, options.maxRequests ?? 100);
    const trustIngress = options.trustIngress ?? false;
    const trustedIngressAddresses = options.trustedIngressAddresses ?? LOOPBACK_ADDRESSES;
    const ctx: AuthRoutesContext = {
      credentials,
      sessions,
      rateLimiter,
      trustIngress,
      trustedIngressAddresses,
      agentApi,
      portLocked: options.portLocked ?? false,
      getUiPort: () => options.uiPort ?? 3000,
    };

    const app = express();
    app.use(express.json());
    app.use(createPublicAuthRoutes(ctx));
    app.use('/api', createUiAuthMiddleware(ctx));
    app.use(createProtectedAuthRoutes(ctx));
    app.get('/api/protected', (_req, res) => res.json({ ok: true }));

    return { app, credentials, sessions, rateLimiter, agentApi };
  };

  it('reports an unauthenticated, unconfigured status', async () => {
    const { app } = await buildHarness();

    const response = await request(app).get('/api/auth/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authEnabled: true,
      configured: false,
      authenticated: false,
      ingress: false,
      unavailable: false,
      setupExpired: false,
      agentApi: { enabled: false, portEditable: true },
    });
  });

  it('reports auth as unavailable when the credential file is corrupt', async () => {
    const { app } = await buildHarness({ corruptAuthFile: true });

    const response = await request(app).get('/api/auth/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authEnabled: true,
      configured: false,
      authenticated: false,
      ingress: false,
      unavailable: true,
      setupExpired: false,
      agentApi: { enabled: false, portEditable: true },
    });
  });

  it('keeps ingress access while reporting auth as unavailable', async () => {
    const { app } = await buildHarness({ trustIngress: true, corruptAuthFile: true });

    const response = await request(app).get('/api/auth/status').set(INGRESS_HEADER);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      authenticated: true,
      ingress: true,
      unavailable: true,
    });
  });

  it('rejects setup while auth is unavailable', async () => {
    const { app, credentials } = await buildHarness({ corruptAuthFile: true });

    const response = await request(app).post('/api/auth/setup').send({ password: 'password123' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'UI_AUTH_UNAVAILABLE' });
    expect(credentials.configured).toBe(false);
    expect(credentials.unavailable).toBe(true);
  });

  it('rejects login while auth is unavailable', async () => {
    const { app } = await buildHarness({ corruptAuthFile: true });

    const response = await request(app).post('/api/auth/login').send({ password: 'password123' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'UI_AUTH_UNAVAILABLE' });
  });

  it('rejects password changes while auth is unavailable, even on ingress', async () => {
    const { app, credentials } = await buildHarness({
      trustIngress: true,
      corruptAuthFile: true,
    });

    const response = await request(app)
      .post('/api/auth/password')
      .set(INGRESS_HEADER)
      .send({ newPassword: 'password123' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'UI_AUTH_UNAVAILABLE' });
    expect(credentials.configured).toBe(false);
    expect(credentials.unavailable).toBe(true);
  });

  it('reports setupExpired after the setup window elapses', async () => {
    let now = 0;
    const { app } = await buildHarness({ setupWindowMs: 1_000, now: () => now });
    now = 1_000;

    const response = await request(app).get('/api/auth/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authEnabled: true,
      configured: false,
      authenticated: false,
      ingress: false,
      unavailable: false,
      setupExpired: true,
      agentApi: { enabled: false, portEditable: true },
    });
  });

  it('rejects setup after the setup window elapses', async () => {
    let now = 0;
    const { app, credentials } = await buildHarness({
      setupWindowMs: 1_000,
      now: () => now,
    });
    now = 1_000;

    const response = await request(app).post('/api/auth/setup').send({ password: 'password123' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'UI_SETUP_EXPIRED' });
    expect(credentials.configured).toBe(false);
    await expect(fs.access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects login after the setup window elapses', async () => {
    let now = 0;
    const { app } = await buildHarness({ setupWindowMs: 1_000, now: () => now });
    now = 1_000;

    const response = await request(app).post('/api/auth/login').send({ password: 'password123' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'UI_SETUP_EXPIRED' });
  });

  it('rejects the initial password change after the setup window elapses', async () => {
    let now = 0;
    const { app, credentials } = await buildHarness({
      trustIngress: true,
      setupWindowMs: 1_000,
      now: () => now,
    });
    now = 1_000;

    const response = await request(app)
      .post('/api/auth/password')
      .set(INGRESS_HEADER)
      .send({ newPassword: 'password123' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'UI_SETUP_EXPIRED' });
    expect(credentials.configured).toBe(false);
  });

  it('still allows login and password changes after the setup window once configured', async () => {
    let now = 0;
    const { app, credentials } = await buildHarness({
      setupWindowMs: 1_000,
      now: () => now,
    });
    await credentials.setPassword('password123');
    now = 5_000;

    const login = await request(app).post('/api/auth/login').send({ password: 'password123' });
    expect(login.status).toBe(200);
    const cookie = readSessionCookie(login);

    const change = await request(app).post('/api/auth/password').set('Cookie', cookie).send({
      currentPassword: 'password123',
      newPassword: 'password456',
    });
    expect(change.status).toBe(200);

    const setup = await request(app).post('/api/auth/setup').send({ password: 'password789' });
    expect(setup.status).toBe(409);
    expect(setup.body).toEqual({ error: 'UI_PASSWORD_ALREADY_CONFIGURED' });
  });

  it('reports ingress requests as authenticated', async () => {
    const { app } = await buildHarness({ trustIngress: true });

    const response = await request(app).get('/api/auth/status').set(INGRESS_HEADER);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ configured: false, authenticated: true, ingress: true });
  });

  it('does not report a forged ingress header from an untrusted address as ingress', async () => {
    const { app } = await buildHarness({
      trustIngress: true,
      trustedIngressAddresses: new Set([SUPERVISOR_ADDRESS]),
    });

    const response = await request(app).get('/api/auth/status').set(INGRESS_HEADER);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ authenticated: false, ingress: false });
  });

  it('sets up the initial password and creates a session', async () => {
    const { app } = await buildHarness();

    const setup = await request(app).post('/api/auth/setup').send({ password: 'password123' });

    expect(setup.status).toBe(200);
    expect(setup.body).toEqual({ ok: true, agentToken: null });
    const cookieHeader = setCookieHeaders(setup).find((value) =>
      value.startsWith(`${UI_SESSION_COOKIE}=`),
    );
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('SameSite=Strict');
    expect(cookieHeader).toContain('Path=/');
    expect(cookieHeader).toContain('Max-Age=604800');
    expect(cookieHeader).not.toContain('Secure');

    const cookie = readSessionCookie(setup);
    const status = await request(app).get('/api/auth/status').set('Cookie', cookie);
    expect(status.body).toMatchObject({ configured: true, authenticated: true, ingress: false });

    const protectedResponse = await request(app).get('/api/protected').set('Cookie', cookie);
    expect(protectedResponse.status).toBe(200);
  });

  it('configures the password and the Agent API in one first-run call', async () => {
    const { app, agentApi } = await buildHarness({ agentApiEnabled: true });

    const setup = await request(app)
      .post('/api/auth/setup')
      .send({
        password: 'password123',
        agentApi: { generateToken: true, port: 3120, allowPacketSend: true },
      });

    expect(setup.status).toBe(200);
    expect(typeof setup.body.agentToken).toBe('string');
    expect(setup.body.agentToken.length).toBeGreaterThan(0);

    expect(agentApi.hasToken()).toBe(true);
    expect(agentApi.getDesiredPort()).toBe(3120);
    expect(agentApi.getAllowPacketSend()).toBe(true);
    await expect(agentApi.load()).resolves.toBeUndefined();
    expect(agentApi.getDesiredPort()).toBe(3120);

    const raw = await fs.readFile(path.join(tempDir, 'agent-api.json'), 'utf8');
    expect(raw).not.toContain(setup.body.agentToken);
  });

  it('leaves the Agent API untouched when the setup payload omits it', async () => {
    const { app, agentApi } = await buildHarness({ agentApiEnabled: true });

    const setup = await request(app).post('/api/auth/setup').send({ password: 'password123' });

    expect(setup.status).toBe(200);
    expect(setup.body).toEqual({ ok: true, agentToken: null });
    expect(agentApi.hasToken()).toBe(false);
    expect(agentApi.getDesiredPort()).toBe(DEFAULT_AGENT_API_PORT);
  });

  it('does not persist the password when the requested agent port is invalid', async () => {
    const { app, agentApi, credentials } = await buildHarness({ agentApiEnabled: true });

    const response = await request(app)
      .post('/api/auth/setup')
      .send({ password: 'password123', agentApi: { port: 70000 } });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'INVALID_PORT' });
    expect(credentials.configured).toBe(false);
    expect(agentApi.getDesiredPort()).toBe(DEFAULT_AGENT_API_PORT);
  });

  it('rejects an agent port that collides with the UI port', async () => {
    const { app, agentApi, credentials } = await buildHarness({
      agentApiEnabled: true,
      uiPort: 3000,
    });

    const response = await request(app)
      .post('/api/auth/setup')
      .send({ password: 'password123', agentApi: { port: 3000, generateToken: true } });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'PORT_CONFLICT' });
    expect(credentials.configured).toBe(false);
    expect(agentApi.hasToken()).toBe(false);
  });

  it('rejects an agent port while the add-on owns the mapping', async () => {
    const { app, credentials } = await buildHarness({ portLocked: true });

    const response = await request(app)
      .post('/api/auth/setup')
      .send({ password: 'password123', agentApi: { port: 3120 } });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'PORT_MANAGED_BY_ADDON' });
    expect(credentials.configured).toBe(false);

    const tokenless = await request(app)
      .post('/api/auth/setup')
      .send({ password: 'password123', agentApi: { generateToken: true } });
    expect(tokenless.status).toBe(200);
    expect(typeof tokenless.body.agentToken).toBe('string');
  });

  it('refuses a second setup attempt without rotating the agent token', async () => {
    const { app, agentApi } = await buildHarness({ agentApiEnabled: true });

    const first = await request(app)
      .post('/api/auth/setup')
      .send({ password: 'password123', agentApi: { generateToken: true } });
    const originalHash = agentApi.getTokenHash()?.toString('base64');

    const second = await request(app)
      .post('/api/auth/setup')
      .send({ password: 'password456', agentApi: { generateToken: true } });

    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'UI_PASSWORD_ALREADY_CONFIGURED' });
    expect(agentApi.getTokenHash()?.toString('base64')).toBe(originalHash);
    expect(first.body.agentToken).toBeDefined();
  });

  it('rejects a malformed agent setup payload', async () => {
    const { app, credentials } = await buildHarness();

    const response = await request(app)
      .post('/api/auth/setup')
      .send({ password: 'password123', agentApi: { allowPacketSend: 'yes' } });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'INVALID_ALLOW_PACKET_SEND' });
    expect(credentials.configured).toBe(false);
  });

  it('exposes the agent API capabilities on the public status', async () => {
    const { app } = await buildHarness({ agentApiEnabled: true, portLocked: true });

    const response = await request(app).get('/api/auth/status');

    expect(response.status).toBe(200);
    expect(response.body.agentApi).toEqual({ enabled: true, portEditable: false });
  });

  it('rejects setup with a password that violates the policy', async () => {
    const { app } = await buildHarness();

    const response = await request(app).post('/api/auth/setup').send({ password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'INVALID_NEW_PASSWORD' });
  });

  it('rejects setup when a password is already configured', async () => {
    const { app, credentials } = await buildHarness();
    await credentials.setPassword('password123');

    const response = await request(app).post('/api/auth/setup').send({ password: 'password456' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'UI_PASSWORD_ALREADY_CONFIGURED' });
    await expect(credentials.verifyPassword('password123')).resolves.toBe(true);
    await expect(credentials.verifyPassword('password456')).resolves.toBe(false);
  });

  it('rejects login before the password is configured', async () => {
    const { app } = await buildHarness();

    const response = await request(app).post('/api/auth/login').send({ password: 'password123' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'UI_SETUP_REQUIRED' });
  });

  it('logs in with the correct password and rejects a wrong password', async () => {
    const { app, credentials } = await buildHarness();
    await credentials.setPassword('password123');

    const wrong = await request(app).post('/api/auth/login').send({ password: 'password456' });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ error: 'INVALID_PASSWORD' });
    expect(setCookieHeaders(wrong)).toHaveLength(0);

    const login = await request(app).post('/api/auth/login').send({ password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ ok: true });

    const cookie = readSessionCookie(login);
    const protectedResponse = await request(app).get('/api/protected').set('Cookie', cookie);
    expect(protectedResponse.status).toBe(200);
  });

  it('adds the Secure attribute when the request is forwarded over HTTPS', async () => {
    const { app } = await buildHarness();

    const setup = await request(app)
      .post('/api/auth/setup')
      .set('X-Forwarded-Proto', 'https')
      .send({ password: 'password123' });

    expect(setup.status).toBe(200);
    const cookieHeader = setCookieHeaders(setup).find((value) =>
      value.startsWith(`${UI_SESSION_COOKIE}=`),
    );
    expect(cookieHeader).toContain('Secure');
  });

  it('logs out by revoking the session and clearing the cookie', async () => {
    const { app } = await buildHarness();
    const setup = await request(app).post('/api/auth/setup').send({ password: 'password123' });
    const cookie = readSessionCookie(setup);

    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie);

    expect(logout.status).toBe(200);
    expect(logout.body).toEqual({ ok: true });
    const cleared = setCookieHeaders(logout).find((value) =>
      value.startsWith(`${UI_SESSION_COOKIE}=`),
    );
    expect(cleared).toContain('Max-Age=0');

    const protectedResponse = await request(app).get('/api/protected').set('Cookie', cookie);
    expect(protectedResponse.status).toBe(401);
    expect(protectedResponse.body).toEqual({ error: 'UI_AUTH_REQUIRED' });
  });

  it('requires a valid current password to change the password', async () => {
    const { app } = await buildHarness();
    const setup = await request(app).post('/api/auth/setup').send({ password: 'password123' });
    const cookie = readSessionCookie(setup);

    const noCurrent = await request(app).post('/api/auth/password').set('Cookie', cookie).send({
      newPassword: 'password456',
    });
    expect(noCurrent.status).toBe(401);
    expect(noCurrent.body).toEqual({ error: 'INVALID_PASSWORD' });

    const wrongCurrent = await request(app)
      .post('/api/auth/password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'password999', newPassword: 'password456' });
    expect(wrongCurrent.status).toBe(401);

    const stillWorks = await request(app).get('/api/protected').set('Cookie', cookie);
    expect(stillWorks.status).toBe(200);
  });

  it('validates the new password policy', async () => {
    const { app } = await buildHarness();
    const setup = await request(app).post('/api/auth/setup').send({ password: 'password123' });
    const cookie = readSessionCookie(setup);

    const response = await request(app).post('/api/auth/password').set('Cookie', cookie).send({
      currentPassword: 'password123',
      newPassword: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'INVALID_NEW_PASSWORD' });
  });

  it('changes the password, revokes old sessions, and issues a new session', async () => {
    const { app } = await buildHarness();
    const setup = await request(app).post('/api/auth/setup').send({ password: 'password123' });
    const oldCookie = readSessionCookie(setup);

    const secondLogin = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' });
    const secondCookie = readSessionCookie(secondLogin);
    expect(secondCookie).not.toBe(oldCookie);

    const change = await request(app).post('/api/auth/password').set('Cookie', oldCookie).send({
      currentPassword: 'password123',
      newPassword: 'password456',
    });

    expect(change.status).toBe(200);
    expect(change.body).toEqual({ ok: true });
    const newCookie = readSessionCookie(change);
    expect(newCookie).not.toBe(oldCookie);
    expect(newCookie).not.toBe(secondCookie);

    expect((await request(app).get('/api/protected').set('Cookie', oldCookie)).status).toBe(401);
    expect((await request(app).get('/api/protected').set('Cookie', secondCookie)).status).toBe(401);
    expect((await request(app).get('/api/protected').set('Cookie', newCookie)).status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login').send({ password: 'password123' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/auth/login').send({ password: 'password456' });
    expect(newLogin.status).toBe(200);
  });

  it('allows trusted ingress to set the initial password without a current password', async () => {
    const { app, credentials } = await buildHarness({ trustIngress: true });

    const response = await request(app)
      .post('/api/auth/password')
      .set(INGRESS_HEADER)
      .send({ newPassword: 'password123' });

    expect(response.status).toBe(200);
    expect(credentials.configured).toBe(true);
    await expect(credentials.verifyPassword('password123')).resolves.toBe(true);
  });

  it('does not allow ingress to skip the current password once configured', async () => {
    const { app, credentials } = await buildHarness({ trustIngress: true });
    await credentials.setPassword('password123');

    const response = await request(app)
      .post('/api/auth/password')
      .set(INGRESS_HEADER)
      .send({ newPassword: 'password456' });

    expect(response.status).toBe(401);
    await expect(credentials.verifyPassword('password123')).resolves.toBe(true);
  });

  it('requires authentication for the password change endpoint', async () => {
    const { app, credentials } = await buildHarness();
    await credentials.setPassword('password123');

    const response = await request(app)
      .post('/api/auth/password')
      .send({ currentPassword: 'password123', newPassword: 'password456' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'UI_AUTH_REQUIRED' });
  });

  it('rate limits login attempts', async () => {
    const { app, credentials } = await buildHarness({ maxRequests: 2 });
    await credentials.setPassword('password123');

    const first = await request(app).post('/api/auth/login').send({ password: 'wrong-password' });
    const second = await request(app).post('/api/auth/login').send({ password: 'wrong-password' });
    const third = await request(app).post('/api/auth/login').send({ password: 'password123' });

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(429);
    expect(third.body).toEqual({ error: 'RATE_LIMITED' });
  });

  it('rate limits setup attempts', async () => {
    const { app } = await buildHarness({ maxRequests: 2 });

    const first = await request(app).post('/api/auth/setup').send({ password: 'short' });
    const second = await request(app).post('/api/auth/setup').send({ password: 'short' });
    const third = await request(app).post('/api/auth/setup').send({ password: 'password123' });

    expect(first.status).toBe(400);
    expect(second.status).toBe(400);
    expect(third.status).toBe(429);
  });
});
