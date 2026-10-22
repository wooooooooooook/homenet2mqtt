import { DiscoveryManager } from '@rs485-homenet/core/mqtt/discovery-manager';
import { normalizePortId } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { BASE_MQTT_PREFIX } from '../utils/constants.js';

export interface DiscoveryPreviewEntity {
  entity: Record<string, unknown>;
  entityType: string;
}

export interface DiscoveryPreviewItem {
  entityId: string;
  entityType: string;
  topic: string;
  payload: unknown;
}

export function buildDiscoveryPreviews(
  portId: string,
  baseConfig: HomenetBridgeConfig,
  entities: DiscoveryPreviewEntity[],
): DiscoveryPreviewItem[] {
  if (entities.length === 0) return [];

  const normalizedPortId = normalizePortId(portId, 0);
  const previewConfig = {
    devices: Array.isArray(baseConfig.devices) ? baseConfig.devices : [],
  } as HomenetBridgeConfig;

  const manager = new DiscoveryManager(
    normalizedPortId,
    previewConfig,
    { publish: () => undefined } as any,
    { subscribe: () => undefined } as any,
    `${BASE_MQTT_PREFIX}/${normalizedPortId}`,
  );

  const previews: DiscoveryPreviewItem[] = [];
  for (const { entity, entityType } of entities) {
    const discovery = manager.buildDiscovery(entity as any, entityType);
    if (!discovery) continue;
    previews.push({
      entityId: typeof entity.id === 'string' ? entity.id : '',
      entityType,
      topic: discovery.topic,
      payload: discovery.payload,
    });
  }

  return previews;
}
