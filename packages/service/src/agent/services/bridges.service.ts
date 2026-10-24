import fs from 'node:fs/promises';
import { logger } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { ConfigItemsError, withConfigWriteLock } from '../../services/config-items.service.js';
import { discoverConfigFiles, resolveSecurePath } from '../../utils/helpers.js';
import { assertConfigFile, getAgentBackup } from './backups.service.js';
import { resolveConfigPortId } from './observation.service.js';
import { assertAgentPort } from './port.service.js';

export interface AgentBridgeDeleteContext {
  configDir: string;
  configInitMarker: string;
  getCurrentConfigs: () => HomenetBridgeConfig[];
  getCurrentConfigFiles: () => string[];
  removeCurrentConfig: (index: number) => void;
  rebuildPortMappings: () => void;
}

export interface DeleteAgentBridgeRequest {
  portId?: unknown;
  configFile?: unknown;
  backupFilename?: unknown;
  confirm?: unknown;
}

export interface DeleteAgentBridgeResult {
  deleted: true;
  portId: string | null;
  configFile: string;
  backupFilename: string;
  loaded: boolean;
  remainingConfigFiles: number;
  initMarkerRemoved: boolean;
  restartRequired: true;
}

interface DeleteTarget {
  portId: string | null;
  configFile: string;
  index: number;
}

const resolveTarget = (
  ctx: AgentBridgeDeleteContext,
  request: DeleteAgentBridgeRequest,
): DeleteTarget => {
  const hasPortId =
    request.portId !== undefined && request.portId !== null && request.portId !== '';
  const hasConfigFile =
    request.configFile !== undefined && request.configFile !== null && request.configFile !== '';

  if (hasPortId) {
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
    if (hasConfigFile && assertConfigFile(request.configFile) !== port.configFile) {
      throw new ConfigItemsError(
        'BRIDGE_TARGET_CONFLICT',
        'portId and configFile refer to different configuration files.',
        400,
      );
    }
    return { portId: port.portId, configFile: port.configFile, index: port.index };
  }

  if (hasConfigFile) {
    const configFile = assertConfigFile(request.configFile);
    const configs = ctx.getCurrentConfigs();
    const index = ctx.getCurrentConfigFiles().indexOf(configFile);
    const portId = index >= 0 ? resolveConfigPortId(configs[index], index) : null;
    return { portId, configFile, index };
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
  return { portId: port.portId, configFile: port.configFile, index: port.index };
};

const readConfirm = (value: unknown): void => {
  if (value !== true) {
    throw new ConfigItemsError(
      'BRIDGE_DELETE_CONFIRM_REQUIRED',
      'Deleting a configuration removes its YAML. Send confirm=true to proceed.',
      400,
    );
  }
};

const readBackupFilename = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConfigItemsError(
      'BACKUP_REQUIRED',
      'Create a backup of the current YAML first and pass its filename as backupFilename.',
      400,
    );
  }
  return value.trim();
};

const readCurrentConfig = async (configPath: string): Promise<string> => {
  try {
    return await fs.readFile(configPath, 'utf8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new ConfigItemsError('CONFIG_FILE_NOT_FOUND', 'Configuration file not found.', 404);
    }
    throw new ConfigItemsError(
      'BRIDGE_DELETE_FAILED',
      'Failed to read the configuration file.',
      500,
    );
  }
};

export async function deleteAgentBridge(
  ctx: AgentBridgeDeleteContext,
  request: DeleteAgentBridgeRequest,
): Promise<DeleteAgentBridgeResult> {
  readConfirm(request.confirm);
  const backupFilename = readBackupFilename(request.backupFilename);
  const target = resolveTarget(ctx, request);

  const configPath = resolveSecurePath(ctx.configDir, target.configFile);
  if (!configPath) {
    throw new ConfigItemsError(
      'BRIDGE_TARGET_INVALID',
      'The configuration file must resolve inside the config directory.',
      400,
    );
  }

  const backup = await getAgentBackup(ctx, backupFilename);
  if (backup.configFile !== target.configFile) {
    throw new ConfigItemsError(
      'BACKUP_TARGET_MISMATCH',
      `The backup belongs to "${backup.configFile}", not "${target.configFile}".`,
      400,
    );
  }

  return withConfigWriteLock(target.configFile, async () => {
    const current = await readCurrentConfig(configPath);
    if (backup.yaml !== current) {
      throw new ConfigItemsError(
        'BACKUP_STALE',
        'The backup does not match the current YAML. Create a fresh backup before deleting.',
        409,
      );
    }

    try {
      await fs.unlink(configPath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new ConfigItemsError('CONFIG_FILE_NOT_FOUND', 'Configuration file not found.', 404);
      }
      throw new ConfigItemsError(
        'BRIDGE_DELETE_FAILED',
        'Failed to delete the configuration file.',
        500,
      );
    }

    const remainingConfigFiles = (await discoverConfigFiles(ctx.configDir)).length;
    let initMarkerRemoved = false;
    if (remainingConfigFiles === 0) {
      try {
        await fs.unlink(ctx.configInitMarker);
        initMarkerRemoved = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn(
            { err: error, marker: ctx.configInitMarker },
            '[agent-api] Failed to remove initialization marker after deleting the last config',
          );
        }
      }
    }

    const loaded = target.index >= 0;
    if (loaded) {
      ctx.removeCurrentConfig(target.index);
      ctx.rebuildPortMappings();
    }

    logger.info(
      {
        portId: target.portId,
        configFile: target.configFile,
        backupFilename,
        loaded,
        remainingConfigFiles,
        initMarkerRemoved,
      },
      '[agent-api] Deleted bridge configuration',
    );

    return {
      deleted: true,
      portId: target.portId,
      configFile: target.configFile,
      backupFilename,
      loaded,
      remainingConfigFiles,
      initMarkerRemoved,
      restartRequired: true,
    };
  });
}
