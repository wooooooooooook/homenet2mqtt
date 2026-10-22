import { logger } from '@rs485-homenet/core';

export const MIN_AGENT_TOKEN_LENGTH = 16;

export interface AgentApiConfig {
  enabled: boolean;
  token: string | null;
  allowPacketSend: boolean;
  disabledReason: 'missing_token' | 'token_too_short' | null;
}

export function loadAgentApiConfig(env: NodeJS.ProcessEnv = process.env): AgentApiConfig {
  const rawToken = env.AGENT_API_TOKEN?.trim();
  const allowPacketSend = env.AGENT_ALLOW_PACKET_SEND?.trim().toLowerCase() === 'true';

  if (!rawToken) {
    logger.warn('[agent-api] AGENT_API_TOKEN is not set. Agent API is disabled.');
    return { enabled: false, token: null, allowPacketSend, disabledReason: 'missing_token' };
  }

  if (rawToken.length < MIN_AGENT_TOKEN_LENGTH) {
    logger.warn(
      { minLength: MIN_AGENT_TOKEN_LENGTH },
      '[agent-api] AGENT_API_TOKEN is too short. Agent API is disabled.',
    );
    return { enabled: false, token: null, allowPacketSend, disabledReason: 'token_too_short' };
  }

  logger.info(
    { allowPacketSend },
    '[agent-api] Agent API enabled. Token is configured (value is not logged).',
  );

  return { enabled: true, token: rawToken, allowPacketSend, disabledReason: null };
}
