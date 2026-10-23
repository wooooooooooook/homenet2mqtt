import { lookup } from 'node:dns/promises';
import type { Request, RequestHandler } from 'express';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { UiCredentialStore } from './ui-credential.store.js';
import type { UiSessionStore } from './ui-session.store.js';

export const UI_SESSION_COOKIE = 'h2m_ui_session';
export const UI_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export const SUPERVISOR_HOSTNAME = 'supervisor';
export const SUPERVISOR_FALLBACK_ADDRESS = '172.30.32.2';

export interface IngressTrustContext {
  trustIngress: boolean;
  trustedIngressAddresses: ReadonlySet<string>;
}

export interface UiAuthGuardContext extends IngressTrustContext {
  sessions: UiSessionStore;
  credentials: UiCredentialStore;
}

interface HeaderCarrier {
  headers: IncomingHttpHeaders;
  socket?: { remoteAddress?: string | null };
}

export function normalizeRemoteAddress(address: string | null | undefined): string | null {
  const trimmed = address?.trim();
  if (!trimmed) return null;

  const withoutZone = trimmed.split('%')[0];
  return withoutZone.startsWith('::ffff:') ? withoutZone.slice(7) : withoutZone;
}

export function isTrustedIngress(
  req: HeaderCarrier,
  trustIngress: boolean,
  trustedIngressAddresses: ReadonlySet<string>,
): boolean {
  if (!trustIngress) return false;

  const header = req.headers['x-ingress-path'];
  if (typeof header !== 'string' || header.trim().length === 0) return false;

  const remoteAddress = normalizeRemoteAddress(req.socket?.remoteAddress);
  return remoteAddress !== null && trustedIngressAddresses.has(remoteAddress);
}

export type SupervisorAddressResolver = () => Promise<readonly string[]>;

const resolveSupervisorAddresses: SupervisorAddressResolver = async () => {
  const records = await lookup(SUPERVISOR_HOSTNAME, { all: true });
  return records.map((record) => record.address);
};

export async function resolveIngressProxyAddresses(
  resolveAddresses: SupervisorAddressResolver = resolveSupervisorAddresses,
): Promise<ReadonlySet<string>> {
  // The Supervisor always owns this address on the hassio network; keep it as a
  // fallback so ingress keeps working when the "supervisor" DNS entry is unavailable.
  const addresses = new Set<string>([SUPERVISOR_FALLBACK_ADDRESS]);

  try {
    for (const rawAddress of await resolveAddresses()) {
      const address = normalizeRemoteAddress(rawAddress);
      if (address) addresses.add(address);
    }
  } catch {
    // Fallback address still allows ingress from the standard Supervisor network.
  }

  return addresses;
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;

    const name = part.slice(0, separator).trim();
    if (!name) continue;

    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

export function getUiSessionToken(req: HeaderCarrier): string | null {
  const token = parseCookieHeader(req.headers.cookie)[UI_SESSION_COOKIE];
  return token && token.length > 0 ? token : null;
}

export function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const value = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return typeof value === 'string' && value.split(',')[0].trim().toLowerCase() === 'https';
}

export function createUiSessionCookie(
  token: string,
  secure: boolean,
  maxAgeSeconds = UI_SESSION_MAX_AGE_SECONDS,
): string {
  const parts = [
    `${UI_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function createClearedUiSessionCookie(secure: boolean): string {
  const parts = [`${UI_SESSION_COOKIE}=`, 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function isHealthRequest(req: Request): boolean {
  const fullPath = `${req.baseUrl}${req.path}`;
  return fullPath.replace(/\/+$/, '') === '/api/health';
}

export function createUiAuthMiddleware(ctx: UiAuthGuardContext): RequestHandler {
  return (req, res, next) => {
    if (isHealthRequest(req)) {
      next();
      return;
    }

    if (isTrustedIngress(req, ctx.trustIngress, ctx.trustedIngressAddresses)) {
      next();
      return;
    }

    if (ctx.credentials.unavailable) {
      res.status(503).json({ error: 'UI_AUTH_UNAVAILABLE' });
      return;
    }

    if (ctx.credentials.setupExpired) {
      res.status(403).json({ error: 'UI_SETUP_EXPIRED' });
      return;
    }

    const token = getUiSessionToken(req);
    if (token && ctx.sessions.validate(token)) {
      next();
      return;
    }

    if (!ctx.credentials.configured) {
      res.status(401).json({ error: 'UI_SETUP_REQUIRED' });
      return;
    }

    res.status(401).json({ error: 'UI_AUTH_REQUIRED' });
  };
}

export interface UiWsVerifyInfo {
  req: IncomingMessage;
}

export type UiWsVerifyClient = (
  info: UiWsVerifyInfo,
  callback: (result: boolean, code?: number, message?: string) => void,
) => void;

export function createUiWsVerifyClient(ctx: UiAuthGuardContext): UiWsVerifyClient {
  return (info, callback) => {
    if (isTrustedIngress(info.req, ctx.trustIngress, ctx.trustedIngressAddresses)) {
      callback(true);
      return;
    }

    if (ctx.credentials.unavailable) {
      callback(false, 503, 'UI_AUTH_UNAVAILABLE');
      return;
    }

    if (ctx.credentials.setupExpired) {
      callback(false, 403, 'UI_SETUP_EXPIRED');
      return;
    }

    const token = getUiSessionToken(info.req);
    if (token && ctx.sessions.validate(token)) {
      callback(true);
      return;
    }

    callback(false, 401, ctx.credentials.configured ? 'UI_AUTH_REQUIRED' : 'UI_SETUP_REQUIRED');
  };
}
