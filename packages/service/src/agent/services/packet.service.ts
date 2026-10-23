import { logger } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { analyzePacketChunk } from '@rs485-homenet/core/utils/packet-analysis';
import type { PacketAnalysisResult } from '@rs485-homenet/core/utils/packet-analysis';
import { ConfigItemsError, readConfigDocument } from '../../services/config-items.service.js';
import type { RateLimiter } from '../../utils/rate-limiter.js';
import type { BridgeInstance } from '../../types/index.js';
import { findBridgeInstanceByPortId } from '../../utils/bridge-lookup.js';
import { parsePacketInput } from '../../utils/packet-input.js';
import type { AgentApiState } from '../agent-api.store.js';
import {
  buildDraftAnalysisConfig,
  validateDraft,
  type DraftConflict,
  type DraftValidationIssue,
} from './draft.service.js';
import {
  isPlainObject,
  parsePacketHexToBytes,
  readDraftInput,
  toInteger,
  readSimilarityThreshold,
} from './input.js';
import { assertAgentPort } from './port.service.js';

const MAX_PACKET_SEND_COUNT = 10;
export const AGENT_PACKET_SEND_MAX_COUNT = MAX_PACKET_SEND_COUNT;

export interface AgentPacketContext {
  configDir: string;
  getCurrentConfigs: () => HomenetBridgeConfig[];
  getCurrentConfigFiles: () => string[];
  getBridges: () => BridgeInstance[];
}

export interface AgentPacketSendContext extends AgentPacketContext {
  agentApi: AgentApiState;
  commandRateLimiter: RateLimiter;
}

export interface AnalyzePacketRequest {
  portId?: unknown;
  input: unknown;
  draft?: unknown;
  similarityThreshold?: unknown;
}

export type AnalyzeAgentPacketResult = PacketAnalysisResult & {
  source: 'active' | 'draft';
  portId: string;
  packetDefaults: HomenetBridgeConfig['packet_defaults'] | null;
  draftValid?: boolean;
  draftApplicable?: boolean;
  draftValidationErrors: DraftValidationIssue[];
  draftConflicts: DraftConflict[];
};

export async function analyzeAgentPacket(
  ctx: AgentPacketContext,
  request: AnalyzePacketRequest,
): Promise<AnalyzeAgentPacketResult> {
  const parsed = parsePacketInput(request.input);
  if ('error' in parsed) {
    throw new ConfigItemsError('INVALID_PACKET_INPUT', parsed.error, 400);
  }

  const port = assertAgentPort(
    { configs: ctx.getCurrentConfigs(), configFiles: ctx.getCurrentConfigFiles() },
    request.portId,
  );
  const similarityThreshold = readSimilarityThreshold(request.similarityThreshold);

  let analysisConfig = port.config;
  let source: 'active' | 'draft' = 'active';
  let draftValidationErrors: DraftValidationIssue[] = [];
  let draftConflicts: DraftConflict[] = [];
  let draftApplicable: boolean | undefined;

  if (request.draft !== undefined) {
    if (!isPlainObject(request.draft)) {
      throw new ConfigItemsError('INVALID_DRAFT', 'draft must be an object.', 400);
    }

    source = 'draft';
    const draft = readDraftInput(request.draft);

    if (port.configFile) {
      try {
        const document = await readConfigDocument(ctx.configDir, port.configFile);
        const validation = validateDraft(port.config, draft, {
          fileContent: document.content,
          similarityThreshold,
        });
        draftValidationErrors = validation.errors;
        draftConflicts = validation.conflicts;
        draftApplicable = validation.applicable;
      } catch (error) {
        logger.warn(
          { err: error, portId: port.portId },
          '[agent-api] Failed to validate draft for packet analysis',
        );
      }
    }

    const merged = buildDraftAnalysisConfig(port.config, draft);
    analysisConfig = merged.config;
    if (draftValidationErrors.length === 0) {
      draftValidationErrors = merged.issues;
    }
  }

  let analysis: PacketAnalysisResult;
  try {
    analysis = analyzePacketChunk(analysisConfig, Buffer.from(parsed.bytes));
  } catch (error) {
    logger.error({ err: error, portId: port.portId }, '[agent-api] Packet analyze failed');
    throw new ConfigItemsError('PACKET_ANALYZE_FAILED', 'Packet analyze failed.', 500);
  }

  return {
    source,
    portId: port.portId,
    packetDefaults: analysisConfig.packet_defaults ?? null,
    draftValid: source === 'draft' ? draftValidationErrors.length === 0 : undefined,
    draftApplicable,
    draftValidationErrors,
    draftConflicts,
    ...analysis,
  };
}

export interface PreviewPacketRequest {
  portId?: unknown;
  hex: unknown;
  header?: unknown;
  footer?: unknown;
  checksum?: unknown;
}

export interface PreviewPacketResult {
  portId: string;
  packet: string;
}

const buildPacket = (
  ctx: AgentPacketContext,
  portIdInput: unknown,
  body: { hex: unknown; header?: unknown; footer?: unknown; checksum?: unknown },
) => {
  if (typeof body.hex !== 'string' || !body.hex.trim()) {
    throw new ConfigItemsError('HEX_REQUIRED', 'hex is required.', 400);
  }

  const port = assertAgentPort(
    { configs: ctx.getCurrentConfigs(), configFiles: ctx.getCurrentConfigFiles() },
    portIdInput,
  );
  const instance = findBridgeInstanceByPortId(ctx.getBridges(), port.portId);
  if (!instance) {
    throw new ConfigItemsError(
      'BRIDGE_NOT_ACTIVE',
      'The bridge for this port is not running.',
      404,
    );
  }

  const result = instance.bridge.constructCustomPacket(body.hex, {
    header: body.header === true,
    footer: body.footer === true,
    checksum: body.checksum === true,
  });
  if (!result.success || !result.packet) {
    throw new ConfigItemsError(
      'PACKET_BUILD_FAILED',
      result.error ?? 'Failed to build packet.',
      400,
    );
  }

  return { port, instance, packet: result.packet };
};

export function previewAgentPacket(
  ctx: AgentPacketContext,
  request: PreviewPacketRequest,
): PreviewPacketResult {
  const { port, packet } = buildPacket(ctx, request.portId, request);
  return { portId: port.portId, packet };
}

export interface SendPacketRequest extends PreviewPacketRequest {
  confirm?: unknown;
  count?: unknown;
  interval?: unknown;
}

export interface SendPacketResult {
  success: true;
  portId: string;
  packet: string;
  sentCount: number;
}

export async function sendAgentPacket(
  ctx: AgentPacketSendContext,
  request: SendPacketRequest,
): Promise<SendPacketResult> {
  if (!ctx.agentApi.getAllowPacketSend()) {
    throw new ConfigItemsError(
      'PACKET_SEND_DISABLED',
      'Packet sending is disabled. Enable it under Settings > Agent API.',
      403,
    );
  }
  if (request.confirm !== true) {
    throw new ConfigItemsError('CONFIRM_REQUIRED', 'confirm must be true to send a packet.', 400);
  }
  if (!ctx.commandRateLimiter.check('agent')) {
    throw new ConfigItemsError('RATE_LIMITED', 'Packet send rate limit exceeded.', 429);
  }

  const count = toInteger(request.count, 1);
  if (count < 1 || count > MAX_PACKET_SEND_COUNT) {
    throw new ConfigItemsError(
      'INVALID_COUNT',
      `count must be between 1 and ${MAX_PACKET_SEND_COUNT}.`,
      400,
    );
  }

  const interval = toInteger(request.interval, 100);
  if (interval < 10 || interval > 1000) {
    throw new ConfigItemsError('INVALID_INTERVAL', 'interval must be between 10 and 1000 ms.', 400);
  }

  const { port, instance, packet } = buildPacket(ctx, request.portId, request);
  const packetBytes = parsePacketHexToBytes(packet);
  if (!packetBytes) {
    throw new ConfigItemsError('PACKET_BUILD_FAILED', 'Failed to convert packet to bytes.', 400);
  }

  // Audit trail: never include the bearer token or request headers.
  logger.info(
    { portId: port.portId, packet, count },
    '[agent-api] Sending raw packet(s) on request',
  );

  let sentCount = 0;
  try {
    for (let index = 0; index < count; index += 1) {
      const sent = instance.bridge.sendRawPacket(port.portId, packetBytes);
      if (!sent) {
        throw new ConfigItemsError(
          'PORT_NOT_READY',
          'The serial port is not ready to send packets.',
          409,
        );
      }
      sentCount += 1;
      if (index < count - 1) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }
  } catch (error) {
    if (error instanceof ConfigItemsError) throw error;
    logger.error({ err: error, portId: port.portId }, '[agent-api] Failed to send packet');
    throw new ConfigItemsError('PACKET_SEND_FAILED', 'Failed to send packet.', 500);
  }

  return { success: true, portId: port.portId, packet, sentCount };
}
