import { HomenetBridgeConfig } from '../config/types.js';
import { EntityConfig } from '../domain/entities/base.entity.js';

export const ENTITY_TYPE_KEYS: (keyof HomenetBridgeConfig)[] = [
  'light',
  'climate',
  'valve',
  'button',
  'sensor',
  'fan',
  'switch',
  'binary_sensor',
  'lock',
  'number',
  'select',
  'text',
  'text_sensor',
];

const entityCache = new WeakMap<
  HomenetBridgeConfig,
  Map<string, EntityConfig & { type: string }>
>();

export function findEntityById(
  config: HomenetBridgeConfig,
  entityId: string,
): (EntityConfig & { type: string }) | undefined {
  let cache = entityCache.get(config);
  if (!cache) {
    cache = new Map();
    for (const type of ENTITY_TYPE_KEYS) {
      const entities = config[type] as EntityConfig[] | undefined;
      if (!entities) continue;
      for (const entity of entities) {
        cache.set(entity.id, { ...entity, type });
      }
    }
    entityCache.set(config, cache);
  }
  return cache.get(entityId);
}

export function clearEntityCache(config: HomenetBridgeConfig): void {
  entityCache.delete(config);
}
