// packages/core/src/state/store.ts

const stateCache = new Map<string, any>();

// Export stateCache directly
export { stateCache };

// Add a getter for stateCache (optional, but good practice)
export function getStateCache() {
  return stateCache;
}
