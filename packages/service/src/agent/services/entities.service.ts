import { logger, normalizeConfig } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import {
  ConfigItemsError,
  persistConfigDocument,
  readConfigDocument,
  withConfigWriteLock,
} from '../../services/config-items.service.js';
import { buildDiscoveryPreviews } from '../../services/discovery-preview.service.js';
import {
  buildApplyConfig,
  validateDraft,
  type AgentDraftInput,
  type DraftValidationResult,
} from './draft.service.js';
import { readSimilarityThreshold } from './input.js';
import { assertAgentPort } from './port.service.js';

export interface AgentEntityDraftContext {
  configDir: string;
  getCurrentConfigs: () => HomenetBridgeConfig[];
  getCurrentConfigFiles: () => string[];
  setCurrentConfigs: (index: number, config: HomenetBridgeConfig) => void;
  setCurrentRawConfigs: (index: number, config: HomenetBridgeConfig) => void;
  rebuildPortMappings: () => void;
}

export interface ValidateEntityDraftRequest {
  portId?: unknown;
  draft: AgentDraftInput;
  similarityThreshold?: unknown;
  discoveryPreview?: unknown;
}

export interface AgentDiscoveryPreview {
  draftId: string;
  entityType: string;
  topic: string;
  payload: unknown;
}

export interface ValidateEntityDraftResult {
  portId: string;
  validation: DraftValidationResult;
  discovery: AgentDiscoveryPreview[];
}

export async function validateAgentEntityDraft(
  ctx: AgentEntityDraftContext,
  request: ValidateEntityDraftRequest,
): Promise<ValidateEntityDraftResult> {
  const port = assertAgentPort(
    { configs: ctx.getCurrentConfigs(), configFiles: ctx.getCurrentConfigFiles() },
    request.portId,
  );
  if (!port.configFile) {
    throw new ConfigItemsError(
      'CONFIG_FILE_UNAVAILABLE',
      'No config file is associated with this port.',
      404,
    );
  }

  const similarityThreshold = readSimilarityThreshold(request.similarityThreshold);
  const document = await readConfigDocument(ctx.configDir, port.configFile);
  const validation = validateDraft(port.config, request.draft, {
    fileContent: document.content,
    similarityThreshold,
  });

  const discovery: AgentDiscoveryPreview[] = [];
  if (request.discoveryPreview === true && validation.valid) {
    const entities = Object.entries(validation.normalized.entities).flatMap(([entityType, list]) =>
      list.map((entity) => ({
        entity: entity as Record<string, unknown>,
        entityType,
      })),
    );
    for (const preview of buildDiscoveryPreviews(port.portId, port.config, entities)) {
      discovery.push({
        draftId: preview.entityId,
        entityType: preview.entityType,
        topic: preview.topic,
        payload: preview.payload,
      });
    }
  }

  return { portId: port.portId, validation, discovery };
}

export interface ApplyEntityDraftRequest {
  portId?: unknown;
  draft: AgentDraftInput;
  draftHash: unknown;
  resolutions?: unknown;
  renames?: unknown;
}

export interface ApplyEntityDraftResult {
  portId: string;
  backup: string;
  applied: {
    entities: string[];
    automations: string[];
    scripts: string[];
  };
  draftHash: string;
  config: HomenetBridgeConfig;
}

export async function applyAgentEntityDraft(
  ctx: AgentEntityDraftContext,
  request: ApplyEntityDraftRequest,
): Promise<ApplyEntityDraftResult> {
  const port = assertAgentPort(
    { configs: ctx.getCurrentConfigs(), configFiles: ctx.getCurrentConfigFiles() },
    request.portId,
  );
  if (!port.configFile) {
    throw new ConfigItemsError(
      'CONFIG_FILE_UNAVAILABLE',
      'No config file is associated with this port.',
      404,
    );
  }
  if (typeof request.draftHash !== 'string' || !request.draftHash.trim()) {
    throw new ConfigItemsError('DRAFT_HASH_REQUIRED', 'draftHash is required.', 400);
  }
  const draftHash = request.draftHash.trim();

  const appliedResult = await withConfigWriteLock(port.configFile, async () => {
    const document = await readConfigDocument(ctx.configDir, port.configFile!);
    const activeConfig = normalizeConfig(
      JSON.parse(JSON.stringify(document.rawConfig)) as HomenetBridgeConfig,
    );

    const validation = validateDraft(activeConfig, request.draft, {
      fileContent: document.content,
    });
    if (!validation.valid) {
      throw new ConfigItemsError('DRAFT_INVALID', 'Draft validation failed.', 422, {
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }
    if (validation.draftHash !== draftHash) {
      throw new ConfigItemsError(
        'DRAFT_STALE',
        'Draft has changed since validation. Re-run entities/validate.',
        409,
        { expected: draftHash, actual: validation.draftHash },
      );
    }

    const applied = buildApplyConfig(activeConfig, request.draft, {
      resolutions: request.resolutions as Record<string, 'overwrite' | 'skip'> | undefined,
      renames: request.renames as Record<string, string> | undefined,
    });

    const persisted = await persistConfigDocument({
      configDir: ctx.configDir,
      configFile: port.configFile!,
      nextConfig: applied.config,
      reason: 'agent_entity_apply',
    });

    return {
      backup: persisted.backup,
      config: persisted.config,
      draftHash: validation.draftHash,
      applied: {
        entities: applied.appliedEntityIds,
        automations: applied.appliedAutomationIds,
        scripts: applied.appliedScriptIds,
      },
    };
  });

  ctx.setCurrentRawConfigs(port.index, appliedResult.config);
  ctx.setCurrentConfigs(port.index, appliedResult.config);
  ctx.rebuildPortMappings();

  logger.info(
    {
      portId: port.portId,
      configFile: port.configFile,
      backup: appliedResult.backup,
      entities: appliedResult.applied.entities,
      automations: appliedResult.applied.automations,
      scripts: appliedResult.applied.scripts,
    },
    '[agent-api] Applied entity draft',
  );

  return {
    portId: port.portId,
    backup: appliedResult.backup,
    applied: appliedResult.applied,
    draftHash: appliedResult.draftHash,
    config: appliedResult.config,
  };
}
