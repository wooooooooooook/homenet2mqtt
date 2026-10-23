import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { AgentApiDisabledReason, AgentApiState } from './agent-api.store.js';

const hashToken = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

const extractBearerToken = (header: string | undefined): string | null => {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
};

const DISABLED_MESSAGES: Record<Exclude<AgentApiDisabledReason, null>, string> = {
  env_disabled:
    'Agent API is disabled. Enable it with the agent_api_enabled add-on option (AGENT_API_ENABLED).',
  no_token: 'Agent API has no token yet. Generate one under Settings > Agent API.',
  store_unavailable:
    'Agent API settings could not be read. Repair or remove the agent API file to re-enable it.',
};

export function createAgentAuthMiddleware(state: AgentApiState): RequestHandler {
  return (req, res, next) => {
    // Read the hash per request so token rotation applies without a restart.
    const expectedHash = state.getTokenHash();
    if (!state.isReady() || !expectedHash) {
      const reason = state.disabledReason() ?? 'env_disabled';
      res.status(503).json({
        error: 'AGENT_API_DISABLED',
        message: DISABLED_MESSAGES[reason],
        reason,
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
    if (
      providedHash.length !== expectedHash.length ||
      !timingSafeEqual(providedHash, expectedHash)
    ) {
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
