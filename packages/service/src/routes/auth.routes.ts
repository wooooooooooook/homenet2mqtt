import { Router, type NextFunction, type Request, type Response } from 'express';
import type { RateLimiter } from '../utils/rate-limiter.js';
import {
  MAX_UI_PASSWORD_LENGTH,
  isValidUiPassword,
  type UiCredentialStore,
} from '../auth/ui-credential.store.js';
import type { UiSessionStore } from '../auth/ui-session.store.js';
import type { AgentApiStore } from '../agent/agent-api.store.js';
import {
  createClearedUiSessionCookie,
  createUiSessionCookie,
  getUiSessionToken,
  isSecureRequest,
  isTrustedIngress,
  type IngressTrustContext,
} from '../auth/ui-auth.middleware.js';

export interface AuthRoutesContext extends IngressTrustContext {
  credentials: UiCredentialStore;
  sessions: UiSessionStore;
  rateLimiter: RateLimiter;
  agentApi: AgentApiStore;
  getUiPort: () => number;
  /** True for the MQTT add-on, where the agent port is a fixed container port mapped by HA. */
  portLocked: boolean;
}

interface SetupAgentApiRequest {
  generateToken: boolean;
  port: number | null;
  allowPacketSend: boolean | null;
}

function readBody(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

class SetupValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'SetupValidationError';
  }
}

function parseOptionalBoolean(value: unknown, code: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw new SetupValidationError(code);
  return value;
}

function parseOptionalPort(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new SetupValidationError('INVALID_PORT');
  }
  return value;
}

/**
 * The first-run screen configures the UI password and the Agent API together,
 * so an AI agent can take over the setup wizard right after bootstrap.
 */
function parseSetupAgentApi(value: unknown): SetupAgentApiRequest | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') throw new SetupValidationError('INVALID_AGENT_API_SETTINGS');

  const raw = value as Record<string, unknown>;
  return {
    generateToken: raw.generateToken === true,
    port: parseOptionalPort(raw.port),
    allowPacketSend: parseOptionalBoolean(raw.allowPacketSend, 'INVALID_ALLOW_PACKET_SEND'),
  };
}

function applySessionCookie(req: Request, res: Response, token: string): void {
  res.setHeader('Set-Cookie', createUiSessionCookie(token, isSecureRequest(req)));
}

function isLoginPasswordCandidate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_UI_PASSWORD_LENGTH;
}

export function createPublicAuthRoutes(ctx: AuthRoutesContext): Router {
  const router = Router();
  let setupInProgress = false;

  router.get('/api/auth/status', (req, res) => {
    const ingress = isTrustedIngress(req, ctx.trustIngress, ctx.trustedIngressAddresses);
    const unavailable = ctx.credentials.unavailable;
    const token = getUiSessionToken(req);
    const authenticated =
      ingress || (!unavailable && token !== null && ctx.sessions.validate(token));

    res.json({
      authEnabled: true,
      configured: ctx.credentials.configured,
      authenticated,
      ingress,
      unavailable,
      setupExpired: ctx.credentials.setupExpired,
      agentApi: {
        enabled: ctx.agentApi.isEnvEnabled(),
        portEditable: !ctx.portLocked,
      },
    });
  });

  router.post('/api/auth/setup', async (req, res, next) => {
    try {
      if (ctx.credentials.unavailable) {
        res.status(503).json({ error: 'UI_AUTH_UNAVAILABLE' });
        return;
      }

      if (ctx.credentials.setupExpired) {
        res.status(403).json({ error: 'UI_SETUP_EXPIRED' });
        return;
      }

      if (!ctx.rateLimiter.check(req.ip || 'unknown')) {
        res.status(429).json({ error: 'RATE_LIMITED' });
        return;
      }

      const { password, agentApi: agentApiInput } = readBody(req.body);
      if (!isValidUiPassword(password)) {
        res.status(400).json({ error: 'INVALID_NEW_PASSWORD' });
        return;
      }

      let agentSetup: SetupAgentApiRequest | null = null;
      try {
        agentSetup = parseSetupAgentApi(agentApiInput);
      } catch (err) {
        if (err instanceof SetupValidationError) {
          res.status(400).json({ error: err.code });
          return;
        }
        throw err;
      }

      if (agentSetup?.port !== undefined && agentSetup?.port !== null) {
        if (ctx.portLocked) {
          res.status(400).json({ error: 'PORT_MANAGED_BY_ADDON' });
          return;
        }
        if (agentSetup.port === ctx.getUiPort()) {
          res.status(400).json({ error: 'PORT_CONFLICT' });
          return;
        }
      }

      if (ctx.credentials.configured || setupInProgress) {
        res.status(409).json({ error: 'UI_PASSWORD_ALREADY_CONFIGURED' });
        return;
      }

      setupInProgress = true;
      let issuedAgentToken: string | null = null;
      try {
        await ctx.credentials.setPassword(password);
        if (agentSetup) {
          if (agentSetup.port !== null) await ctx.agentApi.setPort(agentSetup.port);
          if (agentSetup.allowPacketSend !== null) {
            await ctx.agentApi.setAllowPacketSend(agentSetup.allowPacketSend);
          }
          if (agentSetup.generateToken) {
            issuedAgentToken = await ctx.agentApi.generateToken();
          }
        }
      } finally {
        setupInProgress = false;
      }

      const token = ctx.sessions.create();
      applySessionCookie(req, res, token);
      res.json({ ok: true, agentToken: issuedAgentToken });
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/auth/login', async (req, res, next) => {
    try {
      if (ctx.credentials.unavailable) {
        res.status(503).json({ error: 'UI_AUTH_UNAVAILABLE' });
        return;
      }

      if (ctx.credentials.setupExpired) {
        res.status(403).json({ error: 'UI_SETUP_EXPIRED' });
        return;
      }

      if (!ctx.rateLimiter.check(req.ip || 'unknown')) {
        res.status(429).json({ error: 'RATE_LIMITED' });
        return;
      }

      if (!ctx.credentials.configured) {
        res.status(409).json({ error: 'UI_SETUP_REQUIRED' });
        return;
      }

      const { password } = readBody(req.body);
      if (!isLoginPasswordCandidate(password)) {
        res.status(401).json({ error: 'INVALID_PASSWORD' });
        return;
      }

      const valid = await ctx.credentials.verifyPassword(password);
      if (!valid) {
        res.status(401).json({ error: 'INVALID_PASSWORD' });
        return;
      }

      const token = ctx.sessions.create();
      applySessionCookie(req, res, token);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createProtectedAuthRoutes(ctx: AuthRoutesContext): Router {
  const router = Router();

  router.post('/api/auth/logout', (req, res) => {
    const token = getUiSessionToken(req);
    if (token) {
      ctx.sessions.revoke(token);
    }

    res.setHeader('Set-Cookie', createClearedUiSessionCookie(isSecureRequest(req)));
    res.json({ ok: true });
  });

  router.post('/api/auth/password', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (ctx.credentials.unavailable) {
        res.status(503).json({ error: 'UI_AUTH_UNAVAILABLE' });
        return;
      }

      if (!ctx.credentials.configured && ctx.credentials.setupExpired) {
        res.status(403).json({ error: 'UI_SETUP_EXPIRED' });
        return;
      }

      if (!ctx.rateLimiter.check(req.ip || 'unknown')) {
        res.status(429).json({ error: 'RATE_LIMITED' });
        return;
      }

      const { currentPassword, newPassword } = readBody(req.body);
      if (!isValidUiPassword(newPassword)) {
        res.status(400).json({ error: 'INVALID_NEW_PASSWORD' });
        return;
      }

      if (ctx.credentials.configured) {
        const validCurrent =
          isLoginPasswordCandidate(currentPassword) &&
          (await ctx.credentials.verifyPassword(currentPassword));
        if (!validCurrent) {
          res.status(401).json({ error: 'INVALID_PASSWORD' });
          return;
        }
      }

      await ctx.credentials.setPassword(newPassword);
      ctx.sessions.revokeAll();

      const token = ctx.sessions.create();
      applySessionCookie(req, res, token);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
