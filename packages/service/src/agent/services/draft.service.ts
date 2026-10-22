import { createHash } from 'node:crypto';
import { normalizeConfig, validateConfig } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { ENTITY_TYPE_KEYS } from '../../utils/constants.js';
import { findAllSignatureMatches } from '../../utils/gallery-matching.js';
import { ConfigItemsError } from '../../services/config-items.service.js';

const MQTT_SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const ENTITY_TYPE_SET = new Set<string>(ENTITY_TYPE_KEYS.map((key) => String(key)));
const DEFAULT_SIMILARITY_THRESHOLD = 0.8;

type AnyRecord = Record<string, any>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export interface AgentDraftInput {
  entities?: Record<string, unknown>;
  automations?: unknown;
  scripts?: unknown;
  packetDefaults?: Record<string, unknown>;
}

export interface DraftValidationIssue {
  message: string;
  entityId?: string;
}

export interface DraftConflict {
  draftId: string;
  kind: 'id' | 'signature';
  existingId: string;
  entityType: string;
  similarity: number;
}

export interface NormalizedDraft {
  entities: Record<string, unknown[]>;
  automations: unknown[];
  scripts: unknown[];
  packetDefaults: Record<string, unknown> | null;
}

export interface DraftValidationResult {
  valid: boolean;
  applicable: boolean;
  draftHash: string;
  normalized: NormalizedDraft;
  counts: { entities: number; automations: number; scripts: number };
  errors: DraftValidationIssue[];
  warnings: string[];
  conflicts: DraftConflict[];
  restartRequired: boolean;
}

export interface DraftValidateOptions {
  fileContent: string;
  similarityThreshold?: number;
}

type DraftKind = 'entity' | 'automation' | 'script';

interface CollectedDraftItem {
  kind: DraftKind;
  type: string;
  id: string;
  item: Record<string, unknown>;
}

interface CollectedEntity {
  type: string;
  id: string;
  item: Record<string, unknown>;
}

interface CollectedDraft {
  items: CollectedDraftItem[];
  entities: CollectedEntity[];
  automations: CollectedDraftItem[];
  scripts: CollectedDraftItem[];
  packetDefaults: Record<string, unknown> | null;
  issues: DraftValidationIssue[];
}

const readId = (
  value: unknown,
  label: string,
  issues: DraftValidationIssue[],
  requireMqttSafe: boolean,
): string | null => {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({ message: `${label} requires a non-empty string id.` });
    return null;
  }

  const id = value.trim();
  if (requireMqttSafe && !MQTT_SAFE_ID_PATTERN.test(id)) {
    issues.push({
      message: `${label} id "${id}" must contain only letters, numbers, underscores, or hyphens.`,
      entityId: id,
    });
    return null;
  }

  return id;
};

export function collectDraft(draft: AgentDraftInput): CollectedDraft {
  const issues: DraftValidationIssue[] = [];
  const items: CollectedDraftItem[] = [];
  const entities: CollectedEntity[] = [];
  const automations: CollectedDraftItem[] = [];
  const scripts: CollectedDraftItem[] = [];
  let packetDefaults: Record<string, unknown> | null = null;

  if (draft.entities !== undefined) {
    if (!isPlainObject(draft.entities)) {
      issues.push({ message: 'entities must be an object keyed by entity type.' });
    } else {
      for (const [type, list] of Object.entries(draft.entities)) {
        if (!ENTITY_TYPE_SET.has(type)) {
          issues.push({ message: `Unknown entity type "${type}".` });
          continue;
        }
        if (!Array.isArray(list)) {
          issues.push({ message: `entities.${type} must be an array.` });
          continue;
        }

        list.forEach((raw, index) => {
          const label = `${type}[${index}]`;
          if (!isPlainObject(raw)) {
            issues.push({ message: `${label} must be an object.` });
            return;
          }

          const id = readId(raw.id, label, issues, true);
          if (!id) return;

          if (raw.unique_id !== undefined) {
            if (
              typeof raw.unique_id !== 'string' ||
              !MQTT_SAFE_ID_PATTERN.test(raw.unique_id.trim())
            ) {
              issues.push({
                message: `${label} unique_id must contain only letters, numbers, underscores, or hyphens.`,
                entityId: id,
              });
            }
          }

          const item: CollectedEntity = { type, id, item: raw };
          entities.push(item);
          items.push({ kind: 'entity', type, id, item: raw });
        });
      }
    }
  }

  if (draft.automations !== undefined) {
    if (!Array.isArray(draft.automations)) {
      issues.push({ message: 'automations must be an array.' });
    } else {
      draft.automations.forEach((raw, index) => {
        const label = `automations[${index}]`;
        if (!isPlainObject(raw)) {
          issues.push({ message: `${label} must be an object.` });
          return;
        }
        const id = readId(raw.id, label, issues, false);
        if (!id) return;
        const item: CollectedDraftItem = { kind: 'automation', type: 'automation', id, item: raw };
        automations.push(item);
        items.push(item);
      });
    }
  }

  if (draft.scripts !== undefined) {
    if (!Array.isArray(draft.scripts)) {
      issues.push({ message: 'scripts must be an array.' });
    } else {
      draft.scripts.forEach((raw, index) => {
        const label = `scripts[${index}]`;
        if (!isPlainObject(raw)) {
          issues.push({ message: `${label} must be an object.` });
          return;
        }
        const id = readId(raw.id, label, issues, false);
        if (!id) return;
        const item: CollectedDraftItem = { kind: 'script', type: 'script', id, item: raw };
        scripts.push(item);
        items.push(item);
      });
    }
  }

  if (draft.packetDefaults !== undefined) {
    if (!isPlainObject(draft.packetDefaults)) {
      issues.push({ message: 'packetDefaults must be an object.' });
    } else {
      packetDefaults = draft.packetDefaults;
    }
  }

  const idCounts = new Map<string, number>();
  for (const item of items) {
    idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
  }
  for (const [id, count] of idCounts.entries()) {
    if (count > 1) {
      issues.push({
        message: `Duplicate draft id "${id}" is used by multiple items.`,
        entityId: id,
      });
    }
  }

  return { items, entities, automations, scripts, packetDefaults, issues };
}

interface LocatedItem {
  kind: DraftKind;
  type: string;
  item: AnyRecord;
}

const findActiveLocations = (config: HomenetBridgeConfig, id: string): LocatedItem[] => {
  const locations: LocatedItem[] = [];

  for (const type of ENTITY_TYPE_KEYS) {
    const list = (config as AnyRecord)[type];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (isPlainObject(item) && item.id === id) {
        locations.push({ kind: 'entity', type: String(type), item });
      }
    }
  }

  if (Array.isArray(config.automation)) {
    for (const item of config.automation) {
      if (isPlainObject(item) && item.id === id) {
        locations.push({ kind: 'automation', type: 'automation', item });
      }
    }
  }

  if (Array.isArray(config.scripts)) {
    for (const item of config.scripts) {
      if (isPlainObject(item) && item.id === id) {
        locations.push({ kind: 'script', type: 'script', item });
      }
    }
  }

  return locations;
};

export function detectConflicts(
  activeConfig: HomenetBridgeConfig,
  collected: CollectedDraft,
  similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
): DraftConflict[] {
  const conflicts: DraftConflict[] = [];
  const seen = new Set<string>();

  const addConflict = (conflict: DraftConflict) => {
    const key = `${conflict.draftId}:${conflict.kind}:${conflict.existingId}:${conflict.entityType}`;
    if (seen.has(key)) return;
    seen.add(key);
    conflicts.push(conflict);
  };

  for (const draftItem of collected.items) {
    const exactMatches = findActiveLocations(activeConfig, draftItem.id);
    for (const match of exactMatches) {
      addConflict({
        draftId: draftItem.id,
        kind: 'id',
        existingId: String(match.item.id),
        entityType: match.type,
        similarity: 1,
      });
    }

    if (draftItem.kind !== 'entity' || exactMatches.length > 0) continue;

    const existingList = (activeConfig as AnyRecord)[draftItem.type];
    if (!Array.isArray(existingList)) continue;

    const matches = findAllSignatureMatches(
      draftItem.type,
      draftItem.item,
      existingList,
      similarityThreshold,
    );
    for (const match of matches) {
      if (match.matchId === draftItem.id) continue;
      addConflict({
        draftId: draftItem.id,
        kind: 'signature',
        existingId: match.matchId,
        entityType: draftItem.type,
        similarity: match.similarity,
      });
    }
  }

  return conflicts;
}

const buildValidationConfig = (
  activeConfig: HomenetBridgeConfig,
  collected: CollectedDraft,
): HomenetBridgeConfig => {
  const config = structuredClone(activeConfig);
  const draftIds = new Set(collected.items.map((item) => item.id));

  for (const type of ENTITY_TYPE_KEYS) {
    const list = (config as AnyRecord)[type];
    if (!Array.isArray(list)) continue;
    (config as AnyRecord)[type] = list.filter(
      (item) => !(isPlainObject(item) && typeof item.id === 'string' && draftIds.has(item.id)),
    );
  }

  if (Array.isArray(config.automation)) {
    config.automation = config.automation.filter(
      (item: AnyRecord) =>
        !(isPlainObject(item) && typeof item.id === 'string' && draftIds.has(item.id)),
    ) as typeof config.automation;
  }

  if (Array.isArray(config.scripts)) {
    config.scripts = config.scripts.filter(
      (item: AnyRecord) =>
        !(isPlainObject(item) && typeof item.id === 'string' && draftIds.has(item.id)),
    ) as typeof config.scripts;
  }

  for (const draftItem of collected.entities) {
    let list = (config as AnyRecord)[draftItem.type];
    if (!Array.isArray(list)) {
      list = [];
      (config as AnyRecord)[draftItem.type] = list;
    }
    list.push(structuredClone(draftItem.item));
  }

  if (collected.automations.length > 0) {
    config.automation = [
      ...(Array.isArray(config.automation) ? config.automation : []),
      ...collected.automations.map((item) => structuredClone(item.item)),
    ] as typeof config.automation;
  }

  if (collected.scripts.length > 0) {
    config.scripts = [
      ...(Array.isArray(config.scripts) ? config.scripts : []),
      ...collected.scripts.map((item) => structuredClone(item.item)),
    ] as typeof config.scripts;
  }

  if (collected.packetDefaults) {
    config.packet_defaults = {
      ...(config.packet_defaults ?? {}),
      ...structuredClone(collected.packetDefaults),
    } as HomenetBridgeConfig['packet_defaults'];
  }

  return config;
};

const extractNormalizedDraft = (
  normalizedConfig: HomenetBridgeConfig,
  collected: CollectedDraft,
): { normalized: NormalizedDraft; issues: DraftValidationIssue[] } => {
  const issues: DraftValidationIssue[] = [];
  const normalized: NormalizedDraft = {
    entities: {},
    automations: [],
    scripts: [],
    packetDefaults: null,
  };

  for (const draftItem of collected.entities) {
    const list = (normalizedConfig as AnyRecord)[draftItem.type];
    const found = Array.isArray(list)
      ? list.find((item) => isPlainObject(item) && item.id === draftItem.id)
      : undefined;
    if (!found) {
      issues.push({
        message: `Normalization could not retain id "${draftItem.id}" for ${draftItem.type}.`,
        entityId: draftItem.id,
      });
      continue;
    }
    (normalized.entities[draftItem.type] ??= []).push(found);
  }

  for (const draftItem of collected.automations) {
    const found = Array.isArray(normalizedConfig.automation)
      ? normalizedConfig.automation.find((item) => isPlainObject(item) && item.id === draftItem.id)
      : undefined;
    if (!found) {
      issues.push({
        message: `Normalization could not retain automation id "${draftItem.id}".`,
        entityId: draftItem.id,
      });
      continue;
    }
    normalized.automations.push(found);
  }

  for (const draftItem of collected.scripts) {
    const found = Array.isArray(normalizedConfig.scripts)
      ? normalizedConfig.scripts.find((item) => isPlainObject(item) && item.id === draftItem.id)
      : undefined;
    if (!found) {
      issues.push({
        message: `Normalization could not retain script id "${draftItem.id}".`,
        entityId: draftItem.id,
      });
      continue;
    }
    normalized.scripts.push(found);
  }

  if (collected.packetDefaults) {
    const normalizedPacketDefaults: Record<string, unknown> = {};
    for (const key of Object.keys(collected.packetDefaults)) {
      const source =
        normalizedConfig.packet_defaults &&
        key in (normalizedConfig.packet_defaults as Record<string, unknown>)
          ? (normalizedConfig.packet_defaults as Record<string, unknown>)[key]
          : collected.packetDefaults[key];
      normalizedPacketDefaults[key] = source;
    }
    normalized.packetDefaults = normalizedPacketDefaults;
  }

  return { normalized, issues };
};

const formatValidationError = (error: unknown): DraftValidationIssue[] => {
  if (!(error instanceof Error)) {
    return [{ message: String(error) }];
  }

  const lines = error.message
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter((line) => line && line !== '설정 검증에 실패했습니다:');

  return lines.length > 0 ? lines.map((message) => ({ message })) : [{ message: error.message }];
};

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const sorted: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      sorted[key] = sortKeys(entryValue);
    }
    return sorted;
  }

  return value;
};

const stableStringify = (value: unknown): string => JSON.stringify(sortKeys(value));

export function computeDraftHash(fileContent: string, normalized: NormalizedDraft): string {
  const fileDigest = createHash('sha256').update(fileContent, 'utf8').digest('hex');
  const draftDigest = createHash('sha256')
    .update(stableStringify(normalized), 'utf8')
    .digest('hex');
  const combined = createHash('sha256')
    .update(`${fileDigest}:${draftDigest}`, 'utf8')
    .digest('hex');
  return `sha256:${combined}`;
}

export function validateDraft(
  activeConfig: HomenetBridgeConfig,
  draft: AgentDraftInput,
  options: DraftValidateOptions,
): DraftValidationResult {
  const collected = collectDraft(draft);
  const errors: DraftValidationIssue[] = [...collected.issues];
  const warnings: string[] = [];
  const normalized: NormalizedDraft = {
    entities: {},
    automations: [],
    scripts: [],
    packetDefaults: null,
  };

  if (errors.length === 0) {
    try {
      const merged = buildValidationConfig(activeConfig, collected);
      normalizeConfig(merged);
      validateConfig(merged, {
        automation: draft.automations,
        scripts: draft.scripts,
      } as Partial<HomenetBridgeConfig>);

      const extracted = extractNormalizedDraft(merged, collected);
      errors.push(...extracted.issues);
      if (errors.length === 0) {
        Object.assign(normalized, extracted.normalized);
      }
    } catch (error) {
      errors.push(...formatValidationError(error));
    }
  }

  const threshold = Math.min(
    Math.max(options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD, 0),
    1,
  );
  const conflicts =
    collected.issues.length === 0 ? detectConflicts(activeConfig, collected, threshold) : [];

  for (const conflict of conflicts) {
    if (conflict.kind === 'signature') {
      warnings.push(
        `Draft "${conflict.draftId}" is similar to existing ${conflict.entityType} "${conflict.existingId}" (similarity ${conflict.similarity.toFixed(2)}).`,
      );
    }
  }

  const valid = errors.length === 0;
  const exactConflictCount = conflicts.filter((conflict) => conflict.kind === 'id').length;
  const applicable = valid && exactConflictCount === 0;

  if (valid && !applicable) {
    warnings.push(
      'Exact ID conflicts must be resolved with overwrite, skip, or rename before applying.',
    );
  }

  return {
    valid,
    applicable,
    draftHash: computeDraftHash(options.fileContent, normalized),
    normalized,
    counts: {
      entities: collected.entities.length,
      automations: collected.automations.length,
      scripts: collected.scripts.length,
    },
    errors,
    warnings,
    conflicts,
    restartRequired: true,
  };
}

export interface DraftAnalysisConfigResult {
  config: HomenetBridgeConfig;
  issues: DraftValidationIssue[];
}

export function buildDraftAnalysisConfig(
  activeConfig: HomenetBridgeConfig,
  draft: AgentDraftInput,
): DraftAnalysisConfigResult {
  const collected = collectDraft(draft);
  if (collected.issues.length > 0) {
    return { config: structuredClone(activeConfig), issues: collected.issues };
  }

  const config = buildValidationConfig(activeConfig, collected);
  const issues: DraftValidationIssue[] = [];

  try {
    normalizeConfig(config);
    validateConfig(config, {
      automation: draft.automations,
      scripts: draft.scripts,
    } as Partial<HomenetBridgeConfig>);
  } catch (error) {
    issues.push(...formatValidationError(error));
  }

  return { config, issues };
}

export interface ApplyDraftOptions {
  resolutions?: Record<string, 'overwrite' | 'skip'>;
  renames?: Record<string, string>;
}

export interface ApplyDraftResult {
  config: HomenetBridgeConfig;
  appliedEntityIds: string[];
  appliedAutomationIds: string[];
  appliedScriptIds: string[];
}

const removeLocation = (config: HomenetBridgeConfig, location: LocatedItem): void => {
  const list =
    location.kind === 'entity'
      ? (config as AnyRecord)[location.type]
      : location.kind === 'automation'
        ? config.automation
        : config.scripts;

  if (!Array.isArray(list)) return;
  const index = list.indexOf(location.item);
  if (index !== -1) {
    list.splice(index, 1);
  }
};

const appendItem = (
  config: HomenetBridgeConfig,
  item: CollectedDraftItem,
  targetId: string,
): void => {
  const cloned = structuredClone(item.item) as AnyRecord;
  cloned.id = targetId;

  if (item.kind === 'entity') {
    let list = (config as AnyRecord)[item.type];
    if (!Array.isArray(list)) {
      list = [];
      (config as AnyRecord)[item.type] = list;
    }
    list.push(cloned);
    return;
  }

  if (item.kind === 'automation') {
    const automationList = (
      Array.isArray(config.automation) ? [...config.automation] : []
    ) as AnyRecord[];
    automationList.push(cloned);
    config.automation = automationList as unknown as HomenetBridgeConfig['automation'];
    return;
  }

  const scriptList = (Array.isArray(config.scripts) ? [...config.scripts] : []) as AnyRecord[];
  scriptList.push(cloned);
  config.scripts = scriptList as unknown as HomenetBridgeConfig['scripts'];
};

const validateResolutions = (options: ApplyDraftOptions): void => {
  if (
    options.resolutions !== undefined &&
    (!isPlainObject(options.resolutions) || Array.isArray(options.resolutions))
  ) {
    throw new ConfigItemsError('INVALID_RESOLUTION', 'resolutions must be an object.', 400);
  }
  if (options.renames !== undefined && !isPlainObject(options.renames)) {
    throw new ConfigItemsError('INVALID_RENAME', 'renames must be an object.', 400);
  }

  for (const [id, value] of Object.entries(options.resolutions ?? {})) {
    if (value !== 'overwrite' && value !== 'skip') {
      throw new ConfigItemsError(
        'INVALID_RESOLUTION',
        `Resolution for "${id}" must be "overwrite" or "skip".`,
        400,
      );
    }
  }

  for (const [id, value] of Object.entries(options.renames ?? {})) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new ConfigItemsError(
        'INVALID_RENAME',
        `Rename for "${id}" must be a non-empty string.`,
        400,
      );
    }
  }
};

export function buildApplyConfig(
  activeConfig: HomenetBridgeConfig,
  draft: AgentDraftInput,
  options: ApplyDraftOptions = {},
): ApplyDraftResult {
  validateResolutions(options);

  const collected = collectDraft(draft);
  if (collected.issues.length > 0) {
    throw new ConfigItemsError('DRAFT_INVALID', 'Draft validation failed.', 422, {
      errors: collected.issues,
    });
  }

  const config = structuredClone(activeConfig);
  const appliedEntityIds: string[] = [];
  const appliedAutomationIds: string[] = [];
  const appliedScriptIds: string[] = [];
  const conflicts: DraftConflict[] = [];

  for (const item of collected.items) {
    const resolution = options.resolutions?.[item.id];
    if (resolution === 'skip') continue;

    const rename = options.renames?.[item.id]?.trim();
    const requireMqttSafe = item.kind === 'entity';
    if (rename && requireMqttSafe && !MQTT_SAFE_ID_PATTERN.test(rename)) {
      throw new ConfigItemsError(
        'INVALID_RENAME',
        `Rename for "${item.id}" must contain only letters, numbers, underscores, or hyphens.`,
        400,
      );
    }

    const targetId = rename || item.id;
    const existing = findActiveLocations(config, item.id)[0];
    const targetCollision =
      targetId !== item.id ? findActiveLocations(config, targetId)[0] : undefined;

    if (targetCollision) {
      conflicts.push({
        draftId: item.id,
        kind: 'id',
        existingId: targetId,
        entityType: targetCollision.type,
        similarity: 1,
      });
      throw new ConfigItemsError(
        'DRAFT_CONFLICT',
        `ID "${targetId}" already exists and cannot be used as a rename target.`,
        409,
        { conflicts },
      );
    }

    if (existing) {
      if (!rename && resolution !== 'overwrite') {
        conflicts.push({
          draftId: item.id,
          kind: 'id',
          existingId: String(existing.item.id),
          entityType: existing.type,
          similarity: 1,
        });
        throw new ConfigItemsError(
          'DRAFT_CONFLICT',
          `ID "${item.id}" already exists. Provide a resolution (overwrite/skip) or a rename.`,
          409,
          { conflicts },
        );
      }

      if (!rename && resolution === 'overwrite') {
        removeLocation(config, existing);
      }
    }

    appendItem(config, item, targetId);
    if (item.kind === 'entity') appliedEntityIds.push(targetId);
    else if (item.kind === 'automation') appliedAutomationIds.push(targetId);
    else appliedScriptIds.push(targetId);
  }

  if (collected.packetDefaults) {
    config.packet_defaults = {
      ...(config.packet_defaults ?? {}),
      ...structuredClone(collected.packetDefaults),
    } as HomenetBridgeConfig['packet_defaults'];
  }

  normalizeConfig(config);

  try {
    validateConfig(config, {
      automation: draft.automations,
      scripts: draft.scripts,
    } as Partial<HomenetBridgeConfig>);
  } catch (error) {
    throw new ConfigItemsError('DRAFT_INVALID', 'Draft validation failed.', 422, {
      errors: formatValidationError(error),
    });
  }

  for (const id of appliedEntityIds) {
    if (!findActiveLocations(config, id).some((location) => location.kind === 'entity')) {
      throw new ConfigItemsError(
        'NORMALIZATION_CONFLICT',
        `Entity id "${id}" changed during normalization. Check for duplicate IDs.`,
        409,
      );
    }
  }
  for (const id of appliedAutomationIds) {
    if (!findActiveLocations(config, id).some((location) => location.kind === 'automation')) {
      throw new ConfigItemsError(
        'NORMALIZATION_CONFLICT',
        `Automation id "${id}" changed during normalization. Check for duplicate IDs.`,
        409,
      );
    }
  }
  for (const id of appliedScriptIds) {
    if (!findActiveLocations(config, id).some((location) => location.kind === 'script')) {
      throw new ConfigItemsError(
        'NORMALIZATION_CONFLICT',
        `Script id "${id}" changed during normalization. Check for duplicate IDs.`,
        409,
      );
    }
  }

  return { config, appliedEntityIds, appliedAutomationIds, appliedScriptIds };
}
