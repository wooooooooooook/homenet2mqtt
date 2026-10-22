import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { normalizeConfig } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { dumpConfigToYaml } from '../utils/yaml-dumper.js';
import { ENTITY_TYPE_KEYS } from '../utils/constants.js';
import { resolveSecurePath } from '../utils/helpers.js';
import { saveBackup } from './backup.service.js';
import type { PersistableHomenetBridgeConfig } from '../types/index.js';

export interface ConfigItemsDependencies {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  saveBackup: (configPath: string, config: unknown, reason: string) => Promise<string>;
  dumpConfig: (config: unknown) => string;
}

const defaultDependencies: ConfigItemsDependencies = {
  readFile: (filePath) => fs.readFile(filePath, 'utf8'),
  writeFile: (filePath, content) => fs.writeFile(filePath, content, 'utf8'),
  saveBackup: (configPath, config, reason) => saveBackup(configPath, config as object, reason),
  dumpConfig: (config) => dumpConfigToYaml(config as PersistableHomenetBridgeConfig),
};

export class ConfigItemsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ConfigItemsError';
  }
}

export interface ConfigDocument {
  configPath: string;
  content: string;
  document: Record<string, unknown> & { homenet_bridge: PersistableHomenetBridgeConfig };
  rawConfig: PersistableHomenetBridgeConfig;
}

export async function readConfigDocument(
  configDir: string,
  configFile: string,
  deps: ConfigItemsDependencies = defaultDependencies,
): Promise<ConfigDocument> {
  const configPath = resolveSecurePath(configDir, configFile);
  if (!configPath) {
    throw new ConfigItemsError('CONFIG_NOT_FOUND', 'Config file not found', 404);
  }

  let content: string;
  try {
    content = await deps.readFile(configPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new ConfigItemsError('CONFIG_NOT_FOUND', 'Config file not found', 404);
    }
    throw new ConfigItemsError('CONFIG_READ_FAILED', 'Failed to read config file', 500);
  }

  let document: unknown;
  try {
    document = yaml.load(content);
  } catch {
    throw new ConfigItemsError('INVALID_CONFIG_FILE', 'Invalid config YAML format', 500);
  }

  if (!document || typeof document !== 'object' || !('homenet_bridge' in document)) {
    throw new ConfigItemsError('INVALID_CONFIG_FILE', 'Invalid config file structure', 500);
  }

  const typedDocument = document as ConfigDocument['document'];
  if (!typedDocument.homenet_bridge || typeof typedDocument.homenet_bridge !== 'object') {
    throw new ConfigItemsError('INVALID_CONFIG_FILE', 'Invalid config file structure', 500);
  }

  return {
    configPath,
    content,
    document: typedDocument,
    rawConfig: typedDocument.homenet_bridge,
  };
}

export interface PersistConfigDocumentParams {
  configDir: string;
  configFile: string;
  nextConfig: HomenetBridgeConfig;
  reason: string;
}

export interface PersistConfigDocumentResult {
  backup: string;
  config: HomenetBridgeConfig;
}

export async function persistConfigDocument(
  params: PersistConfigDocumentParams,
  deps: ConfigItemsDependencies = defaultDependencies,
): Promise<PersistConfigDocumentResult> {
  const document = await readConfigDocument(params.configDir, params.configFile, deps);
  const backupPath = await deps.saveBackup(document.configPath, document.document, params.reason);

  document.document.homenet_bridge = params.nextConfig;
  await deps.writeFile(document.configPath, deps.dumpConfig(document.document));

  return { backup: path.basename(backupPath), config: params.nextConfig };
}

export interface AddConfigItemsParams {
  configDir: string;
  configFile: string;
  yaml: string;
  reason?: string;
}

export interface AddConfigItemsResult {
  backup: string;
  config: HomenetBridgeConfig;
  mergedKeys: string[];
}

export async function addConfigItems(
  params: AddConfigItemsParams,
  deps: ConfigItemsDependencies = defaultDependencies,
): Promise<AddConfigItemsResult> {
  let newItems: unknown;
  try {
    newItems = yaml.load(params.yaml);
  } catch {
    throw new ConfigItemsError('INVALID_YAML', 'Invalid YAML format');
  }

  if (!newItems || typeof newItems !== 'object' || Array.isArray(newItems)) {
    throw new ConfigItemsError('INVALID_YAML', 'Invalid YAML content');
  }

  const document = await readConfigDocument(params.configDir, params.configFile, deps);
  const normalizedFullConfig = normalizeConfig(document.rawConfig);
  const backupPath = await deps.saveBackup(
    document.configPath,
    document.document,
    params.reason ?? 'add_item',
  );

  const mergedKeys: string[] = [];
  const itemRecord = newItems as Record<string, unknown>;

  for (const key of Object.keys(itemRecord)) {
    const configKey = key as keyof HomenetBridgeConfig & string;
    if (
      !ENTITY_TYPE_KEYS.includes(configKey) &&
      configKey !== 'automation' &&
      configKey !== 'scripts'
    ) {
      continue;
    }

    const newEntries = itemRecord[key];
    if (!Array.isArray(newEntries)) {
      continue;
    }

    mergedKeys.push(configKey);

    let existingList = normalizedFullConfig[configKey] as unknown;
    if (!Array.isArray(existingList)) {
      existingList = [];
      (normalizedFullConfig as unknown as Record<string, unknown>)[configKey] = existingList;
    }
    const targetList = existingList as Array<Record<string, unknown>>;

    const existingTargetIds = new Set(targetList.map((entry) => entry.id).filter(Boolean));
    const otherEntityIdsMaps = new Map<string, Set<unknown>>();
    if (ENTITY_TYPE_KEYS.includes(configKey)) {
      for (const otherKey of ENTITY_TYPE_KEYS) {
        if (otherKey === configKey) continue;
        const otherList = normalizedFullConfig[otherKey] as unknown;
        if (Array.isArray(otherList)) {
          otherEntityIdsMaps.set(
            otherKey,
            new Set(
              (otherList as Array<Record<string, unknown>>)
                .map((entry) => entry.id)
                .filter(Boolean),
            ),
          );
        }
      }
    }

    for (const newItem of newEntries as Array<Record<string, unknown>>) {
      const newItemId = newItem?.id;
      if (!newItemId) continue;

      if (existingTargetIds.has(newItemId)) {
        throw new ConfigItemsError(
          'DUPLICATE_ID',
          `ID '${String(newItemId)}' already exists in ${configKey}.`,
          409,
        );
      }

      if (ENTITY_TYPE_KEYS.includes(configKey)) {
        for (const [otherKey, idsSet] of otherEntityIdsMaps.entries()) {
          if (idsSet.has(newItemId)) {
            throw new ConfigItemsError(
              'DUPLICATE_ID',
              `ID '${String(newItemId)}' already exists in ${String(otherKey)}.`,
              409,
            );
          }
        }
      }
    }

    targetList.push(...(newEntries as Array<Record<string, unknown>>));
  }

  if (mergedKeys.length === 0) {
    throw new ConfigItemsError(
      'NO_VALID_ITEMS',
      'No valid items found to add. Ensure YAML structure matches root schema keys (e.g. light:, automation:)',
    );
  }

  document.document.homenet_bridge = normalizedFullConfig;
  await deps.writeFile(document.configPath, deps.dumpConfig(document.document));

  return {
    backup: path.basename(backupPath),
    config: normalizedFullConfig,
    mergedKeys,
  };
}

const configWriteQueues = new Map<string, Promise<unknown>>();

export function withConfigWriteLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = configWriteQueues.get(key) ?? Promise.resolve();
  const next = previous.then(
    () => task(),
    () => task(),
  );

  configWriteQueues.set(key, next);
  const cleanup = () => {
    if (configWriteQueues.get(key) === next) {
      configWriteQueues.delete(key);
    }
  };
  void next.then(cleanup, cleanup);

  return next;
}
