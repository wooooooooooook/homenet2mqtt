// packages/core/src/transports/matter/utils/transaction-is-offline.ts

import type { ActionContext } from '@matter/main';
import { hasLocalActor } from '@matter/main/protocol';

/**
 * Checks if a transaction context is offline/local.
 * Returns true if the context is missing or has a local actor (internal update).
 */
export function transactionIsOffline(context: ActionContext | undefined | null) {
  return !context || hasLocalActor(context);
}
