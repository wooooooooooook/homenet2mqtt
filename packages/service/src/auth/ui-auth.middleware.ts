import type { Request, RequestHandler } from 'express';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { UiCredentialStore } from './ui-credential.store.js';
import type { UiSessionStore } from './ui-session.store.js';

export const UI_SESSION_COOKIE = 'h2m_ui_session';
export const UI_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface UiAuthGuardContext {
  sessions: UiSessionStore;
  credentials: UiCredentialStore;
  trustIngress: boolean;
}

interface HeaderCarrier {
  headers: IncomingHttpHeaders;
}

export function isTrustedIngress(req: HeaderCarrier, trustIngress: boolean): boolean {
  if (!trustIngress) return false;
  const header = req.headers['x-ingress-path'];
  return typeof header === 'string' && header.trim().length > 0;
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

    if (isTrustedIngress(req, ctx.trustIngress)) {
      next();
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
    if (isTrustedIngress(info.req, ctx.trustIngress)) {
      callback(true);
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
