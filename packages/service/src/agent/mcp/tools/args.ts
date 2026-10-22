import { toInteger } from '../../services/input.js';

export const readStringArg = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const readIntegerArg = (
  args: Record<string, unknown>,
  key: string,
  fallback: number,
): number => toInteger(args[key], fallback);

export const readDraftArgs = (args: Record<string, unknown>) => ({
  entities: args.entities as Record<string, unknown> | undefined,
  automations: args.automations,
  scripts: args.scripts,
  packetDefaults: args.packetDefaults as Record<string, unknown> | undefined,
});
