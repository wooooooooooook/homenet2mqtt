
import { logger, normalizePortId } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { ENTITY_TYPE_KEYS } from './constants.js';
import type { BridgeInstance } from '../types/index.js';

export const findConfigIndexByPortId = (
  configs: HomenetBridgeConfig[],
  portId: string
): number => {
  for (let i = 0; i < configs.length; i += 1) {
    const config = configs[i];
    if (!config.serial) continue;

    const configPortId = normalizePortId(config.serial.portId, i);
    if (configPortId === portId) {
      return i;
    }
  }
  return -1;
};

export const findConfigIndexForEntity = (
  configs: HomenetBridgeConfig[],
  entityId: string
): number => {
  logger.warn(
    `[service] findConfigIndexForEntity called for ${entityId}. This is an exceptional situation where portId was not found.`,
  );
  for (let i = 0; i < configs.length; i += 1) {
    const config = configs[i];
    for (const type of ENTITY_TYPE_KEYS) {
      const entities = config[type] as Array<any> | undefined;
      if (Array.isArray(entities) && entities.some((entity) => entity.id === entityId)) {
        return i;
      }
    }
  }
  return -1;
};

export const findConfigIndexForAutomation = (
  configs: HomenetBridgeConfig[],
  automationId: string
): number => {
  logger.warn(
    `[service] findConfigIndexForAutomation called for ${automationId}. This is an exceptional situation where portId was not found.`,
  );
  for (let i = 0; i < configs.length; i += 1) {
    const config = configs[i];
    const automations = config.automation;
    if (Array.isArray(automations) && automations.some((a) => a.id === automationId)) {
      return i;
    }
  }
  return -1;
};

export const findConfigIndexForScript = (
  configs: HomenetBridgeConfig[],
  scriptId: string
): number => {
  logger.warn(
    `[service] findConfigIndexForScript called for ${scriptId}. This is an exceptional situation where portId was not found.`,
  );
  for (let i = 0; i < configs.length; i += 1) {
    const config = configs[i];
    const scripts = config.scripts;
    if (Array.isArray(scripts) && scripts.some((s) => s.id === scriptId)) {
      return i;
    }
  }
  return -1;
};

export const findBridgeForEntity = (
  configs: HomenetBridgeConfig[],
  bridges: BridgeInstance[],
  configFiles: string[],
  entityId: string
): BridgeInstance | undefined => {
  const index = findConfigIndexForEntity(configs, entityId);
  if (index === -1) {
    return undefined;
  }

  const targetConfigFile = configFiles[index];
  return bridges.find((instance) => instance.configFile === targetConfigFile);
};
