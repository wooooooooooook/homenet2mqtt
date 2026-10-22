import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { AgentApiConfig } from './agent.config.js';

const hashToken = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

const extractBearerToken = (header: string | undefined): string | null => {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
};

export function createAgentAuthMiddleware(config: AgentApiConfig): RequestHandler {
  const expectedHash = config.enabled && config.token ? hashToken(config.token) : null;

  return (req, res, next) => {
    if (!expectedHash) {
      res.status(503).json({
        error: 'AGENT_API_DISABLED',
        message: 'Agent API is disabled. Set AGENT_API_TOKEN to enable it.',
      });
      return;
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'A Bearer token is required.',
      });
      return;
    }

    const providedHash = hashToken(token);
    if (!timingSafeEqual(providedHash, expectedHash)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid Bearer token.',
      });
      return;
    }

    next();
  };
}
