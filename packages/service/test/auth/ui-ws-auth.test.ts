import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import { UiCredentialStore } from '../../src/auth/ui-credential.store.js';
import { UiSessionStore } from '../../src/auth/ui-session.store.js';
import { UI_SESSION_COOKIE, createUiWsVerifyClient } from '../../src/auth/ui-auth.middleware.js';

const SUPERVISOR_ADDRESS = '172.30.32.2';
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1']);

const requestWithHeaders = (
  headers: Record<string, string>,
  remoteAddress = '127.0.0.1',
): IncomingMessage => ({ headers, socket: { remoteAddress } }) as unknown as IncomingMessage;

const verify = (
  verifyClient: ReturnType<typeof createUiWsVerifyClient>,
  headers: Record<string, string>,
  remoteAddress?: string,
): Promise<{ accepted: boolean; code?: number; message?: string }> =>
  new Promise((resolve) => {
    verifyClient({ req: requestWithHeaders(headers, remoteAddress) }, (accepted, code, message) => {
      resolve({ accepted, code, message });
    });
  });

describe('createUiWsVerifyClient', () => {
  let tempDir: string;
  let credentials: UiCredentialStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'h2m-ui-ws-auth-'));
    credentials = new UiCredentialStore(path.join(tempDir, 'ui-auth.json'));
    await credentials.load();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('accepts a request with a valid session cookie', async () => {
    await credentials.setPassword('password123');
    const sessions = new UiSessionStore({ cleanupIntervalMs: 0 });
    const token = sessions.create();
    const verifyClient = createUiWsVerifyClient({
      credentials,
      sessions,
      trustIngress: false,
      trustedIngressAddresses: LOOPBACK_ADDRESSES,
    });

    const result = await verify(verifyClient, { cookie: `${UI_SESSION_COOKIE}=${token}` });

    expect(result).toEqual({ accepted: true, code: undefined, message: undefined });
  });

  it('rejects a request without a session when a password is configured', async () => {
    await credentials.setPassword('password123');
    const sessions = new UiSessionStore({ cleanupIntervalMs: 0 });
    const verifyClient = createUiWsVerifyClient({
      credentials,
      sessions,
      trustIngress: false,
      trustedIngressAddresses: LOOPBACK_ADDRESSES,
    });

    const result = await verify(verifyClient, {});

    expect(result).toEqual({ accepted: false, code: 401, message: 'UI_AUTH_REQUIRED' });
  });

  it('rejects a request before the password is configured', async () => {
    const sessions = new UiSessionStore({ cleanupIntervalMs: 0 });
    const verifyClient = createUiWsVerifyClient({
      credentials,
      sessions,
      trustIngress: false,
      trustedIngressAddresses: LOOPBACK_ADDRESSES,
    });

    const result = await verify(verifyClient, {});

    expect(result).toEqual({ accepted: false, code: 401, message: 'UI_SETUP_REQUIRED' });
  });

  it('rejects expired sessions', async () => {
    await credentials.setPassword('password123');
    let now = 1_000;
    const sessions = new UiSessionStore({
      cleanupIntervalMs: 0,
      ttlMs: 10,
      now: () => now,
    });
    const token = sessions.create();
    now = 1_010;
    const verifyClient = createUiWsVerifyClient({
      credentials,
      sessions,
      trustIngress: false,
      trustedIngressAddresses: LOOPBACK_ADDRESSES,
    });

    const result = await verify(verifyClient, { cookie: `${UI_SESSION_COOKIE}=${token}` });

    expect(result.accepted).toBe(false);
    expect(result.code).toBe(401);
  });

  it('accepts trusted ingress requests without a session', async () => {
    const sessions = new UiSessionStore({ cleanupIntervalMs: 0 });
    const verifyClient = createUiWsVerifyClient({
      credentials,
      sessions,
      trustIngress: true,
      trustedIngressAddresses: LOOPBACK_ADDRESSES,
    });

    const result = await verify(verifyClient, { 'x-ingress-path': '/api/hassio_ingress/token' });

    expect(result).toEqual({ accepted: true, code: undefined, message: undefined });
  });

  it('accepts ingress from the Supervisor address over IPv4-mapped IPv6', async () => {
    const sessions = new UiSessionStore({ cleanupIntervalMs: 0 });
    const verifyClient = createUiWsVerifyClient({
      credentials,
      sessions,
      trustIngress: true,
      trustedIngressAddresses: new Set([SUPERVISOR_ADDRESS]),
    });

    const result = await verify(
      verifyClient,
      { 'x-ingress-path': '/api/hassio_ingress/token' },
      '::ffff:172.30.32.2',
    );

    expect(result.accepted).toBe(true);
  });

  it('rejects a forged ingress header from an untrusted source address', async () => {
    await credentials.setPassword('password123');
    const sessions = new UiSessionStore({ cleanupIntervalMs: 0 });
    const verifyClient = createUiWsVerifyClient({
      credentials,
      sessions,
      trustIngress: true,
      trustedIngressAddresses: new Set([SUPERVISOR_ADDRESS]),
    });

    const result = await verify(
      verifyClient,
      { 'x-ingress-path': '/api/hassio_ingress/token' },
      '192.168.0.10',
    );

    expect(result).toEqual({ accepted: false, code: 401, message: 'UI_AUTH_REQUIRED' });
  });

  it('rejects the ingress header when ingress trust is disabled', async () => {
    await credentials.setPassword('password123');
    const sessions = new UiSessionStore({ cleanupIntervalMs: 0 });
    const verifyClient = createUiWsVerifyClient({
      credentials,
      sessions,
      trustIngress: false,
      trustedIngressAddresses: LOOPBACK_ADDRESSES,
    });

    const result = await verify(verifyClient, { 'x-ingress-path': '/api/hassio_ingress/token' });

    expect(result).toEqual({ accepted: false, code: 401, message: 'UI_AUTH_REQUIRED' });
  });
});
