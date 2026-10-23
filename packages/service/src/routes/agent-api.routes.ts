import { Router, type RequestHandler } from 'express';
import { logger } from '@rs485-homenet/core';
import type { RateLimiter } from '../utils/rate-limiter.js';
import type { AgentApiStore } from '../agent/agent-api.store.js';

export interface AgentApiRoutesContext {
  agentApi: AgentApiStore;
  rateLimiter: RateLimiter;
  getUiPort: () => number;
  /** True for the MQTT add-on, where the agent port is a fixed container port mapped by HA. */
  portLocked: boolean;
  triggerRestart: () => Promise<void>;
}

function readBody(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

export function createAgentApiRoutes(ctx: AgentApiRoutesContext): Router {
  const router = Router();

  const guard: RequestHandler = (req, res, next) => {
    if (!ctx.rateLimiter.check(req.ip || 'unknown')) {
      res.status(429).json({ error: 'RATE_LIMITED' });
      return;
    }
    next();
  };

  router.get('/api/agent-api', (_req, res) => {
    res.json({
      enabled: ctx.agentApi.isEnvEnabled(),
      ready: ctx.agentApi.isReady(),
      hasToken: ctx.agentApi.hasToken(),
      allowPacketSend: ctx.agentApi.getAllowPacketSend(),
      port: ctx.agentApi.getDesiredPort(),
      actualPort: ctx.agentApi.getActualPort(),
      unavailable: ctx.agentApi.unavailable(),
      disabledReason: ctx.agentApi.disabledReason(),
      portEditable: !ctx.portLocked,
    });
  });

  router.post('/api/agent-api/token', guard, async (_req, res, next) => {
    if (ctx.agentApi.unavailable()) {
      res.status(503).json({ error: 'AGENT_API_UNAVAILABLE' });
      return;
    }

    try {
      const rotated = ctx.agentApi.hasToken();
      const token = await ctx.agentApi.generateToken();
      logger.warn(
        '[agent-api] Agent API token issued from the UI. Previous tokens are no longer valid.',
      );
      res.json({ ok: true, rotated, token });
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/agent-api/setup-ack', guard, async (_req, res, next) => {
    if (ctx.agentApi.unavailable()) {
      res.status(503).json({ error: 'AGENT_API_UNAVAILABLE' });
      return;
    }

    try {
      await ctx.agentApi.ackFirstRun();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.put('/api/agent-api/settings', guard, async (req, res, next) => {
    if (ctx.agentApi.unavailable()) {
      res.status(503).json({ error: 'AGENT_API_UNAVAILABLE' });
      return;
    }

    const { port, allowPacketSend } = readBody(req.body);
    const wantsPortChange = port !== undefined;

    if (wantsPortChange) {
      if (ctx.portLocked) {
        res.status(400).json({
          error: 'PORT_MANAGED_BY_ADDON',
          message:
            'Under the Home Assistant add-on the agent port is mapped in the add-on Network settings.',
        });
        return;
      }

      if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
        res.status(400).json({ error: 'INVALID_PORT' });
        return;
      }

      if (port === ctx.getUiPort()) {
        res.status(400).json({ error: 'PORT_CONFLICT' });
        return;
      }
    }

    if (allowPacketSend !== undefined && typeof allowPacketSend !== 'boolean') {
      res.status(400).json({ error: 'INVALID_ALLOW_PACKET_SEND' });
      return;
    }

    try {
      if (allowPacketSend !== undefined) {
        await ctx.agentApi.setAllowPacketSend(allowPacketSend);
      }

      let restartRequired = false;
      if (wantsPortChange && port !== ctx.agentApi.getDesiredPort()) {
        await ctx.agentApi.setPort(port as number);
        await ctx.triggerRestart();
        restartRequired = true;
      }

      res.json({
        ok: true,
        restartRequired,
        port: ctx.agentApi.getDesiredPort(),
        allowPacketSend: ctx.agentApi.getAllowPacketSend(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
