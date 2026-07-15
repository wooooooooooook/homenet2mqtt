import { Logger } from '@matter/general';

const logger = Logger.get('ApplyPatchState');

/**
 * Safely applies a patch to Matter state, only updating changed properties.
 * Uses deep equality comparison to avoid unnecessary Matter transactions.
 */
export function applyPatchState<T extends object>(state: T, patch: Partial<T>): Partial<T> {
  const actualPatch: Partial<T> = {};

  for (const key in patch) {
    if (Object.hasOwn(patch, key)) {
      const patchValue = patch[key];
      if (patchValue !== undefined) {
        const stateValue = state[key];
        if (!deepEqual(stateValue, patchValue)) {
          actualPatch[key] = patchValue;
        }
      }
    }
  }

  const failedKeys: string[] = [];
  for (const key in actualPatch) {
    if (!Object.hasOwn(actualPatch, key)) continue;
    try {
      state[key] = actualPatch[key] as T[Extract<keyof T, string>];
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      // Endpoint not yet attached to a node, all remaining writes will fail too
      if (
        errorMessage.includes(
          'Endpoint storage inaccessible because endpoint is not a node and is not owned by another endpoint',
        )
      ) {
        logger.debug(
          `Suppressed endpoint storage error, patch not applied: ${JSON.stringify(actualPatch)}`,
        );
        return actualPatch;
      }
      // Transaction conflict, all remaining writes will also fail
      if (
        errorMessage.includes('synchronous-transaction-conflict') ||
        (errorMessage.includes('Cannot lock') && errorMessage.includes('synchronously'))
      ) {
        logger.debug(`Transaction conflict, state update DROPPED: ${JSON.stringify(actualPatch)}`);
        return actualPatch;
      }
      // Per-property failure: log warning and continue with remaining properties
      failedKeys.push(key);
      logger.warn(`Failed to set property '${key}': ${errorMessage}`);
    }
  }

  if (failedKeys.length > 0) {
    logger.warn(`${failedKeys.length} properties failed to update: [${failedKeys.join(', ')}]`);
  }

  return actualPatch;
}

function deepEqual<T>(a: T, b: T): boolean {
  if (a == null || b == null) {
    return a === b;
  }
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((vA, idx) => deepEqual(vA, b[idx]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keys = Object.keys({ ...a, ...b }) as (keyof T)[];
    return keys.every((key) => deepEqual(a[key], b[key]));
  }
  return a === b;
}
