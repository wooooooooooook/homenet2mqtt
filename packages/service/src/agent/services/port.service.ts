import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { ConfigItemsError } from '../../services/config-items.service.js';
import { resolveConfigPortId } from './observation.service.js';

export interface AgentPortSource {
  configs: HomenetBridgeConfig[];
  configFiles: string[];
}

export interface ResolvedAgentPort {
  index: number;
  portId: string;
  configFile: string | undefined;
  config: HomenetBridgeConfig;
}

export interface AgentPortError {
  status: number;
  code: 'CONFIG_NOT_LOADED' | 'PORT_ID_REQUIRED' | 'PORT_NOT_FOUND';
  message: string;
}

export type AgentPortResolution = ResolvedAgentPort | AgentPortError;

export const isAgentPortError = (value: AgentPortResolution): value is AgentPortError =>
  'code' in value && 'status' in value;

export function resolveAgentPort(
  source: AgentPortSource,
  portIdInput: unknown,
): AgentPortResolution {
  const { configs, configFiles } = source;
  if (configs.length === 0) {
    return {
      status: 404,
      code: 'CONFIG_NOT_LOADED',
      message: 'No configuration is loaded yet.',
    };
  }

  const requested = typeof portIdInput === 'string' ? portIdInput.trim() : undefined;
  if (!requested) {
    if (configs.length > 1) {
      return {
        status: 400,
        code: 'PORT_ID_REQUIRED',
        message: 'portId is required when multiple ports are loaded.',
      };
    }
    return {
      index: 0,
      portId: resolveConfigPortId(configs[0], 0),
      configFile: configFiles[0],
      config: configs[0],
    };
  }

  const index = configs.findIndex(
    (config, configIndex) => resolveConfigPortId(config, configIndex) === requested,
  );
  if (index === -1) {
    return {
      status: 404,
      code: 'PORT_NOT_FOUND',
      message: `Port "${requested}" was not found.`,
    };
  }

  return {
    index,
    portId: requested,
    configFile: configFiles[index],
    config: configs[index],
  };
}

export function assertAgentPort(source: AgentPortSource, portIdInput: unknown): ResolvedAgentPort {
  const resolved = resolveAgentPort(source, portIdInput);
  if (isAgentPortError(resolved)) {
    throw new ConfigItemsError(resolved.code, resolved.message, resolved.status);
  }
  return resolved;
}
