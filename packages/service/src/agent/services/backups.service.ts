import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { logger, normalizeConfig } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import {
  ConfigItemsError,
  readConfigDocument,
  withConfigWriteLock,
} from '../../services/config-items.service.js';
import { resolveSecurePath } from '../../utils/helpers.js';
import { assertAgentPort } from './port.service.js';

export interface AgentBackupContext {
  configDir: string;
  getCurrentConfigs: () => HomenetBridgeConfig[];
  getCurrentConfigFiles: () => string[];
  setCurrentConfigs: (index: number, config: HomenetBridgeConfig) => void;
  setCurrentRawConfigs: (index: number, config: HomenetBridgeConfig) => void;
  rebuildPortMappings: () => void;
}

export interface AgentBackupInfo {
  filename: string;
  configFile: string;
  reason: string;
  size: number;
  createdAt: string;
}

export interface AgentBackupList {
  backups: AgentBackupInfo[];
  totalSize: number;
  configFile: string | null;
}

export interface AgentBackupContent extends AgentBackupInfo {
  bytes: number;
  yaml: string;
}

export interface ListAgentBackupsOptions {
  portId?: unknown;
  configFile?: unknown;
}

export interface CreateAgentBackupRequest {
  portId?: unknown;
  configFile?: unknown;
  reason?: unknown;
}

export interface RestoreAgentBackupRequest {
  filename?: unknown;
  confirm?: unknown;
}

export interface RestoreAgentBackupResult {
  restoredFrom: string;
  configFile: string;
  bytes: number;
  previousBackup: string | null;
  loaded: boolean;
  restartRequired: boolean;
}

const BACKUP_DIR_NAME = 'backups';
const BACKUP_FILENAME_PATTERN = /^(.+)\.(\d{4}-\d{2}-\d{2}T[\d-]+Z)\.(.+)\.bak$/;
const CONFIG_FILENAME_PATTERN = /^[^/\\]+\.ya?ml$/;
const REASON_PATTERN = /^[A-Za-z0-9_-]{1,60}$/;
const DEFAULT_REASON = 'agent_backup';
const MAX_BACKUP_NAME_ATTEMPTS = 5;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const backupDirectory = (configDir: string): string => path.join(configDir, BACKUP_DIR_NAME);

const assertBackupFilename = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConfigItemsError(
      'BACKUP_FILENAME_INVALID',
      'filename must be a backup file name returned by list_backups.',
      400,
    );
  }
  const filename = value.trim();
  if (
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0') ||
    path.basename(filename) !== filename
  ) {
    throw new ConfigItemsError(
      'BACKUP_FILENAME_INVALID',
      'filename must be a plain backup file name without directory components.',
      400,
    );
  }
  return filename;
};

const parseBackupFilename = (filename: string): { configFile: string; reason: string } => {
  const match = BACKUP_FILENAME_PATTERN.exec(filename);
  if (!match) {
    throw new ConfigItemsError(
      'BACKUP_FILENAME_INVALID',
      'filename is not a configuration backup produced by this service.',
      400,
    );
  }

  const configFile = match[1];
  if (!CONFIG_FILENAME_PATTERN.test(configFile)) {
    throw new ConfigItemsError(
      'BACKUP_FILENAME_INVALID',
      'The backup does not reference a YAML configuration file.',
      400,
    );
  }

  return { configFile, reason: match[3] };
};

export const assertConfigFile = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConfigItemsError(
      'BACKUP_TARGET_INVALID',
      'configFile must be a YAML configuration filename.',
      400,
    );
  }
  const configFile = value.trim();
  if (!CONFIG_FILENAME_PATTERN.test(configFile) || path.basename(configFile) !== configFile) {
    throw new ConfigItemsError(
      'BACKUP_TARGET_INVALID',
      'configFile must be a plain *.yaml or *.yml filename.',
      400,
    );
  }
  return configFile;
};

const readReason = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return DEFAULT_REASON;
  if (typeof value !== 'string' || !REASON_PATTERN.test(value.trim())) {
    throw new ConfigItemsError(
      'BACKUP_REASON_INVALID',
      'reason must match ^[A-Za-z0-9_-]{1,60}$.',
      400,
    );
  }
  return value.trim();
};

const resolveTargetConfigFile = (
  ctx: AgentBackupContext,
  request: CreateAgentBackupRequest,
): string => {
  if (request.portId !== undefined && request.portId !== null && request.portId !== '') {
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
    return port.configFile;
  }

  if (
    request.configFile !== undefined &&
    request.configFile !== null &&
    request.configFile !== ''
  ) {
    return assertConfigFile(request.configFile);
  }

  const port = assertAgentPort(
    { configs: ctx.getCurrentConfigs(), configFiles: ctx.getCurrentConfigFiles() },
    undefined,
  );
  if (!port.configFile) {
    throw new ConfigItemsError(
      'CONFIG_FILE_UNAVAILABLE',
      'No config file is associated with this port.',
      404,
    );
  }
  return port.configFile;
};

const resolveListedConfigFile = (
  ctx: AgentBackupContext,
  options: ListAgentBackupsOptions,
): string | undefined => {
  if (options.portId !== undefined && options.portId !== null && options.portId !== '') {
    const port = assertAgentPort(
      { configs: ctx.getCurrentConfigs(), configFiles: ctx.getCurrentConfigFiles() },
      options.portId,
    );
    if (!port.configFile) {
      throw new ConfigItemsError(
        'CONFIG_FILE_UNAVAILABLE',
        'No config file is associated with this port.',
        404,
      );
    }
    return port.configFile;
  }

  if (
    options.configFile !== undefined &&
    options.configFile !== null &&
    options.configFile !== ''
  ) {
    return assertConfigFile(options.configFile);
  }

  return undefined;
};

const resolveBackupPath = (
  ctx: Pick<AgentBackupContext, 'configDir'>,
  filename: string,
): string => {
  const resolved = resolveSecurePath(backupDirectory(ctx.configDir), filename);
  if (!resolved) {
    throw new ConfigItemsError(
      'BACKUP_FILENAME_INVALID',
      'filename must resolve inside the configuration backup directory.',
      400,
    );
  }
  return resolved;
};

const buildBackupFilename = (configFile: string, reason: string, attempt: number): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = attempt === 0 ? reason : `${reason}-${attempt}`;
  return `${configFile}.${timestamp}.${suffix}.bak`;
};

const writeBackupFile = async (
  ctx: AgentBackupContext,
  configFile: string,
  content: string,
  reason: string,
): Promise<AgentBackupInfo> => {
  const directory = backupDirectory(ctx.configDir);
  await fs.mkdir(directory, { recursive: true });

  for (let attempt = 0; attempt < MAX_BACKUP_NAME_ATTEMPTS; attempt += 1) {
    const filename = buildBackupFilename(configFile, reason, attempt);
    const filePath = path.join(directory, filename);

    try {
      await fs.writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
      const stats = await fs.stat(filePath);
      return {
        filename,
        configFile,
        reason,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'EEXIST' && attempt < MAX_BACKUP_NAME_ATTEMPTS - 1) {
        continue;
      }
      throw new ConfigItemsError('BACKUP_CREATE_FAILED', 'Failed to write the backup file.', 500);
    }
  }

  throw new ConfigItemsError('BACKUP_CREATE_FAILED', 'Failed to write the backup file.', 500);
};

const readBackupFile = async (
  ctx: Pick<AgentBackupContext, 'configDir'>,
  filename: string,
): Promise<AgentBackupContent> => {
  const { configFile, reason } = parseBackupFilename(filename);
  const filePath = resolveBackupPath(ctx, filename);

  let content: string;
  let stats;
  try {
    [content, stats] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new ConfigItemsError('BACKUP_NOT_FOUND', 'Backup file not found.', 404);
    }
    throw new ConfigItemsError('BACKUP_READ_FAILED', 'Failed to read the backup file.', 500);
  }

  return {
    filename,
    configFile,
    reason,
    size: stats.size,
    createdAt: stats.mtime.toISOString(),
    bytes: Buffer.byteLength(content, 'utf8'),
    yaml: content,
  };
};

const parseRestoredConfig = (content: string): HomenetBridgeConfig => {
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch {
    throw new ConfigItemsError('BACKUP_INVALID', 'The backup is not valid YAML.', 400);
  }

  if (!isPlainObject(parsed) || !isPlainObject(parsed.homenet_bridge)) {
    throw new ConfigItemsError(
      'BACKUP_INVALID',
      'The backup does not contain a homenet_bridge configuration.',
      400,
    );
  }

  try {
    return normalizeConfig(
      JSON.parse(JSON.stringify(parsed.homenet_bridge)) as HomenetBridgeConfig,
    );
  } catch (error) {
    const err = error as Error;
    throw new ConfigItemsError(
      'BACKUP_INVALID',
      'The backup configuration could not be normalized.',
      400,
      { cause: err.message },
    );
  }
};

const backupCurrentConfig = async (
  ctx: AgentBackupContext,
  configFile: string,
  configPath: string,
): Promise<string | null> => {
  let content: string;
  try {
    content = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw new ConfigItemsError(
      'BACKUP_CREATE_FAILED',
      'Failed to back up the current configuration before restoring.',
      500,
    );
  }

  const backup = await writeBackupFile(ctx, configFile, content, 'pre_restore');
  return backup.filename;
};

const writeRestoredConfig = async (
  configDir: string,
  configFile: string,
  configPath: string,
  content: string,
): Promise<void> => {
  const tempPath = path.join(configDir, `.${configFile}.restore-${process.pid}-${Date.now()}.tmp`);

  try {
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, configPath);
  } catch {
    await fs.unlink(tempPath).catch(() => undefined);
    throw new ConfigItemsError(
      'BACKUP_RESTORE_FAILED',
      'Failed to restore the configuration.',
      500,
    );
  }
};

export async function listAgentBackups(
  ctx: AgentBackupContext,
  options: ListAgentBackupsOptions = {},
): Promise<AgentBackupList> {
  const configFile = resolveListedConfigFile(ctx, options);
  const directory = backupDirectory(ctx.configDir);

  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return { backups: [], totalSize: 0, configFile: configFile ?? null };
    }
    throw new ConfigItemsError('BACKUP_LIST_FAILED', 'Failed to list backup files.', 500);
  }

  const backups = (
    await Promise.all(
      entries.map(async (filename): Promise<AgentBackupInfo | null> => {
        let parsed: { configFile: string; reason: string };
        try {
          parsed = parseBackupFilename(filename);
        } catch {
          return null;
        }
        if (configFile && parsed.configFile !== configFile) return null;

        try {
          const stats = await fs.stat(path.join(directory, filename));
          if (!stats.isFile()) return null;
          return {
            filename,
            configFile: parsed.configFile,
            reason: parsed.reason,
            size: stats.size,
            createdAt: stats.mtime.toISOString(),
          };
        } catch {
          return null;
        }
      }),
    )
  )
    .filter((backup): backup is AgentBackupInfo => backup !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    backups,
    totalSize: backups.reduce((total, backup) => total + backup.size, 0),
    configFile: configFile ?? null,
  };
}

export async function createAgentBackup(
  ctx: AgentBackupContext,
  request: CreateAgentBackupRequest,
): Promise<AgentBackupInfo & { bytes: number; yaml: string }> {
  const configFile = resolveTargetConfigFile(ctx, request);
  const reason = readReason(request.reason);

  return withConfigWriteLock(configFile, async () => {
    const document = await readConfigDocument(ctx.configDir, configFile);
    const backup = await writeBackupFile(ctx, configFile, document.content, reason);

    logger.info(
      { configFile, backup: backup.filename, reason },
      '[agent-api] Created configuration backup',
    );

    return {
      ...backup,
      bytes: Buffer.byteLength(document.content, 'utf8'),
      yaml: document.content,
    };
  });
}

export async function getAgentBackup(
  ctx: Pick<AgentBackupContext, 'configDir'>,
  filenameInput: unknown,
): Promise<AgentBackupContent> {
  const filename = assertBackupFilename(filenameInput);
  return readBackupFile(ctx, filename);
}

export async function restoreAgentBackup(
  ctx: AgentBackupContext,
  request: RestoreAgentBackupRequest,
): Promise<RestoreAgentBackupResult> {
  if (request.confirm !== true) {
    throw new ConfigItemsError(
      'BACKUP_CONFIRM_REQUIRED',
      'Restoring a configuration overwrites YAML. Send confirm=true to proceed.',
      400,
    );
  }

  const filename = assertBackupFilename(request.filename);
  const backup = await readBackupFile(ctx, filename);
  const restoredConfig = parseRestoredConfig(backup.yaml);

  const configPath = resolveSecurePath(ctx.configDir, backup.configFile);
  if (!configPath) {
    throw new ConfigItemsError(
      'BACKUP_TARGET_INVALID',
      'The backup does not map to a configuration file inside the config directory.',
      400,
    );
  }

  return withConfigWriteLock(backup.configFile, async () => {
    const previousBackup = await backupCurrentConfig(ctx, backup.configFile, configPath);
    await writeRestoredConfig(ctx.configDir, backup.configFile, configPath, backup.yaml);

    const index = ctx.getCurrentConfigFiles().indexOf(backup.configFile);
    const loaded = index >= 0;
    if (loaded) {
      ctx.setCurrentRawConfigs(index, restoredConfig);
      ctx.setCurrentConfigs(index, restoredConfig);
      ctx.rebuildPortMappings();
    }

    logger.info(
      {
        configFile: backup.configFile,
        restoredFrom: backup.filename,
        previousBackup,
        loaded,
      },
      '[agent-api] Restored configuration backup',
    );

    return {
      restoredFrom: backup.filename,
      configFile: backup.configFile,
      bytes: backup.bytes,
      previousBackup,
      loaded,
      restartRequired: true,
    };
  });
}
