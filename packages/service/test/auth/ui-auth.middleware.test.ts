import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { UiCredentialStore } from '../../src/auth/ui-credential.store.js';
import { UiSessionStore } from '../../src/auth/ui-session.store.js';
import {
  SUPERVISOR_FALLBACK_ADDRESS,
  UI_SESSION_COOKIE,
  createUiAuthMiddleware,
  getUiSessionToken,
  isTrustedIngress,
  normalizeRemoteAddress,
  parseCookieHeader,
  resolveIngressProxyAddresses,
} from '../../src/auth/ui-auth.middleware.js';

const SUPERVISOR_ADDRESS = '172.30.32.2';
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1']);

interface Harness {
  app: Express;
  credentials: UiCredentialStore;
  sessions: UiSessionStore;
  filePath: string;
}

describe('UI auth middleware', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'h2m-ui-auth-middleware-'));
    filePath = path.join(tempDir, 'ui-auth.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const buildHarness = async (
    trustIngress: boolean,
    sessionOptions: { ttlMs?: number; now?: () => number } = {},
    trustedIngressAddresses: ReadonlySet<string> = LOOPBACK_ADDRESSES,
  ): Promise<Harness> => {
    const credentials = new UiCredentialStore(filePath);
    await credentials.load();
    const sessions = new UiSessionStore({ cleanupIntervalMs: 0, ...sessionOptions });

    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      createUiAuthMiddleware({ credentials, sessions, trustIngress, trustedIngressAddresses }),
    );
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    app.get('/api/protected', (_req, res) => res.json({ ok: true }));

    return { app, credentials, sessions, filePath };
  };

  it('allows health checks without a session', async () => {
    const { app } = await buildHarness(false);

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('allows health checks with a trailing slash', async () => {
    const { app } = await buildHarness(false);

    const response = await request(app).get('/api/health/');

    expect(response.status).toBe(200);
  });

  it('returns UI_SETUP_REQUIRED when no password is configured', async () => {
    const { app } = await buildHarness(false);

    const response = await request(app).get('/api/protected');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'UI_SETUP_REQUIRED' });
  });

  it('returns UI_AUTH_REQUIRED when configured but unauthenticated', async () => {
    const { app, credentials } = await buildHarness(false);
    await credentials.setPassword('password123');

    const response = await request(app).get('/api/protected');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'UI_AUTH_REQUIRED' });
  });

  it('allows requests with a valid session cookie', async () => {
    const { app, credentials, sessions } = await buildHarness(false);
    await credentials.setPassword('password123');
    const token = sessions.create();

    const response = await request(app)
      .get('/api/protected')
      .set('Cookie', `${UI_SESSION_COOKIE}=${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('rejects expired sessions', async () => {
    let now = 1_000;
    const { app, credentials, sessions } = await buildHarness(false, {
      ttlMs: 1,
      now: () => now,
    });
    await credentials.setPassword('password123');
    const token = sessions.create();
    now = 1_001;

    const response = await request(app)
      .get('/api/protected')
      .set('Cookie', `${UI_SESSION_COOKIE}=${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'UI_AUTH_REQUIRED' });
  });

  it('skips authentication for trusted ingress requests', async () => {
    const { app } = await buildHarness(true);

    const response = await request(app)
      .get('/api/protected')
      .set('X-Ingress-Path', '/api/hassio_ingress/token');

    expect(response.status).toBe(200);
  });

  it('does not trust the ingress header when ingress trust is disabled', async () => {
    const { app } = await buildHarness(false);

    const response = await request(app)
      .get('/api/protected')
      .set('X-Ingress-Path', '/api/hassio_ingress/token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'UI_SETUP_REQUIRED' });
  });

  it('does not trust the ingress header from an untrusted source address', async () => {
    const { app } = await buildHarness(true, {}, new Set([SUPERVISOR_ADDRESS]));

    const response = await request(app)
      .get('/api/protected')
      .set('X-Ingress-Path', '/api/hassio_ingress/token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'UI_SETUP_REQUIRED' });
  });

  it('does not trust ingress requests without the ingress path header', async () => {
    const { app } = await buildHarness(true);

    const response = await request(app).get('/api/protected');

    expect(response.status).toBe(401);
  });

  it('only trusts requests from the configured ingress proxy address', () => {
    const trusted = new Set([SUPERVISOR_ADDRESS]);
    const request = (remoteAddress: string | undefined, path = '/api/hassio_ingress/x') => ({
      headers: { 'x-ingress-path': path },
      socket: remoteAddress ? { remoteAddress } : undefined,
    });

    expect(isTrustedIngress(request(SUPERVISOR_ADDRESS), true, trusted)).toBe(true);
    expect(isTrustedIngress(request('::ffff:172.30.32.2'), true, trusted)).toBe(true);
    expect(isTrustedIngress(request('192.168.0.10'), true, trusted)).toBe(false);
    expect(isTrustedIngress(request(undefined), true, trusted)).toBe(false);
    expect(isTrustedIngress(request(SUPERVISOR_ADDRESS), true, new Set())).toBe(false);
    expect(isTrustedIngress(request(SUPERVISOR_ADDRESS), false, trusted)).toBe(false);
    expect(isTrustedIngress(request(SUPERVISOR_ADDRESS, '   '), true, trusted)).toBe(false);
    expect(isTrustedIngress(request(SUPERVISOR_ADDRESS, ''), true, trusted)).toBe(false);
  });

  it('normalizes IPv4-mapped and zoned remote addresses', () => {
    expect(normalizeRemoteAddress('::ffff:172.30.32.2')).toBe('172.30.32.2');
    expect(normalizeRemoteAddress('fe80::1%eth0')).toBe('fe80::1');
    expect(normalizeRemoteAddress('  127.0.0.1  ')).toBe('127.0.0.1');
    expect(normalizeRemoteAddress('')).toBeNull();
    expect(normalizeRemoteAddress(null)).toBeNull();
  });

  it('resolves ingress proxy addresses with a Supervisor fallback', async () => {
    const resolved = await resolveIngressProxyAddresses(async () => [
      '172.30.32.2',
      '::ffff:10.0.0.5',
    ]);

    expect(resolved).toContain(SUPERVISOR_FALLBACK_ADDRESS);
    expect(resolved).toContain('10.0.0.5');
  });

  it('keeps the Supervisor fallback when address resolution fails', async () => {
    const resolved = await resolveIngressProxyAddresses(async () => {
      throw new Error('dns unavailable');
    });

    expect(resolved).toEqual(new Set([SUPERVISOR_FALLBACK_ADDRESS]));
  });

  it('parses cookie headers', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader('a=1; b=hello%20world; invalid; =empty')).toEqual({
      a: '1',
      b: 'hello world',
    });
    expect(parseCookieHeader('bad=%E0%A4%A')).toEqual({ bad: '%E0%A4%A' });
  });

  it('extracts the UI session token from the request', () => {
    expect(getUiSessionToken({ headers: { cookie: 'other=1; h2m_ui_session=abc' } })).toBe('abc');
    expect(getUiSessionToken({ headers: { cookie: 'other=1' } })).toBeNull();
    expect(getUiSessionToken({ headers: {} })).toBeNull();
  });
});
