import { Logger } from '@matter/general';

const logger = Logger.get('ApplyPatchState');

interface PendingPatch<T extends object> {
  patch: Partial<T>;
  timeoutId: NodeJS.Timeout | null;
  retryCount: number;
  sequence: number;
}

const pendingPatches = new WeakMap<object, PendingPatch<any>>();
const MAX_RETRY_COUNT = 20;
const RETRY_DELAY_MS = 20;
let globalSequence = 0;

/**
 * Safely applies a patch to Matter state, only updating changed properties.
 * Uses deep equality comparison to avoid unnecessary Matter transactions.
 * If a transaction conflict is encountered, it retries the update asynchronously.
 */
export function applyPatchState<T extends object>(
  state: T,
  patch: Partial<T>,
  isRetry = false,
  sequence?: number,
): Partial<T> {
  const currentSequence = sequence ?? ++globalSequence;
  let finalPatch = { ...patch };

  // If there's a pending patch, merge it (newer patch values take precedence)
  const pending = pendingPatches.get(state);
  if (pending) {
    if (!isRetry) {
      if (currentSequence < pending.sequence) {
        logger.debug(
          `Out-of-order patch dropped: incoming sequence ${currentSequence} is older than pending sequence ${pending.sequence}`,
        );
        return {};
      }
      finalPatch = { ...pending.patch, ...patch };
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      pendingPatches.delete(state);
    }
  }

  const actualPatch: Partial<T> = {};

  for (const key in finalPatch) {
    if (Object.hasOwn(finalPatch, key)) {
      const patchValue = finalPatch[key];
      if (patchValue !== undefined) {
        try {
          const stateValue = state[key];
          if (!deepEqual(stateValue, patchValue)) {
            actualPatch[key] = patchValue;
          }
        } catch (e) {
          if (isExpiredReferenceError(e)) {
            logger.debug(`Context expired while reading property '${key}', dropping patch.`);
            pendingPatches.delete(state);
            return {};
          }
          logger.warn(
            `Failed to read property '${key}': ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  }

  if (Object.keys(actualPatch).length === 0) {
    return {};
  }

  const failedKeys: string[] = [];
  let isConflict = false;

  for (const key in actualPatch) {
    if (!Object.hasOwn(actualPatch, key)) continue;
    try {
      state[key] = actualPatch[key] as T[Extract<keyof T, string>];
    } catch (e) {
      if (isExpiredReferenceError(e)) {
        logger.debug(`Context expired while writing property '${key}', dropping patch.`);
        pendingPatches.delete(state);
        return actualPatch;
      }
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
        isConflict = true;
        break;
      }
      // Per-property failure: log warning and continue with remaining properties
      failedKeys.push(key);
      logger.warn(`Failed to set property '${key}': ${errorMessage}`);
    }
  }

  if (failedKeys.length > 0) {
    logger.warn(`${failedKeys.length} properties failed to update: [${failedKeys.join(', ')}]`);
  }

  if (isConflict) {
    const retryCount = isRetry && pending ? pending.retryCount + 1 : 1;

    if (retryCount <= MAX_RETRY_COUNT) {
      logger.debug(
        `Transaction conflict during state update. Retrying in ${RETRY_DELAY_MS}ms (attempt ${retryCount}/${MAX_RETRY_COUNT}): ${JSON.stringify(
          actualPatch,
        )}`,
      );

      const currentPending = pendingPatches.get(state) || {
        patch: {},
        timeoutId: null,
        retryCount: 0,
        sequence: currentSequence,
      };

      if (currentPending.timeoutId) {
        clearTimeout(currentPending.timeoutId);
      }

      currentPending.patch = { ...currentPending.patch, ...actualPatch };
      currentPending.retryCount = retryCount;
      currentPending.sequence = currentSequence;
      currentPending.timeoutId = setTimeout(() => {
        try {
          applyPatchState(state, currentPending.patch, true, currentPending.sequence);
        } catch (e) {
          logger.error(
            `Error in async applyPatchState retry: ${e instanceof Error ? e.stack : String(e)}`,
          );
          pendingPatches.delete(state);
        }
      }, RETRY_DELAY_MS);

      pendingPatches.set(state, currentPending);
    } else {
      logger.error(
        `Transaction conflict, state update DROPPED after ${MAX_RETRY_COUNT} retries: ${JSON.stringify(
          actualPatch,
        )}`,
      );
      pendingPatches.delete(state);
    }
    return actualPatch;
  }

  if (isRetry) {
    pendingPatches.delete(state);
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

function isExpiredReferenceError(e: any): boolean {
  if (!e) return false;
  const errorMessage = e instanceof Error ? e.message : String(e);
  const errorName = e.name || (e.constructor && e.constructor.name);
  return (
    errorName === 'ExpiredReferenceError' ||
    errorMessage.includes('ExpiredReference') ||
    errorMessage.includes('expired-reference') ||
    errorMessage.includes('context has exited') ||
    errorMessage.includes('no longer available')
  );
}
