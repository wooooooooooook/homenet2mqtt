import type { EntityCategory } from '../types';

/**
 * Creates a composite key for an entity.
 */
export const makeEntityKey = (
  portId: string | undefined,
  entityId: string,
  category: EntityCategory = 'entity',
) => `${category}:${portId ?? 'unknown'}:${entityId}`;

/**
 * Parses a composite key into its component parts.
 */
export const parseEntityKey = (
  key: string,
): { portId: string | undefined; entityId: string; category: EntityCategory } => {
  const parts = key.split(':');
  if (parts.length < 3) {
    const idx = key.indexOf(':');
    if (idx === -1) return { portId: undefined, entityId: key, category: 'entity' };
    const portId = key.slice(0, idx);
    return {
      portId: portId === 'unknown' ? undefined : portId,
      entityId: key.slice(idx + 1),
      category: 'entity',
    };
  }
  const [category, portId, ...rest] = parts;
  return {
    category: (category as EntityCategory) ?? 'entity',
    portId: portId === 'unknown' ? undefined : portId,
    entityId: rest.join(':'),
  };
};
