import { normalizePortId } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import type { BridgeInstance } from '../types/index.js';

export function findBridgeInstanceByPortId(
  bridges: BridgeInstance[],
  portId: string,
): BridgeInstance | undefined {
  for (const instance of bridges) {
    const serial = instance.config.serial;
    if (!serial) continue;
    const pId = normalizePortId(serial.portId, 0);
    if (pId === portId) {
      return instance;
    }
  }
  return undefined;
}

export function findConfigByPortId(
  configs: HomenetBridgeConfig[],
  portId: string | undefined,
): HomenetBridgeConfig | undefined {
  if (!configs || configs.length === 0) return undefined;
  if (!portId) return configs[0];

  for (const [index, config] of configs.entries()) {
    const serial = config.serial;
    if (!serial) continue;
    const pId = normalizePortId(serial.portId, index);
    if (pId === portId) {
      return config;
    }
  }
  return undefined;
}
