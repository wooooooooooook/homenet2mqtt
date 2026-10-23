import { readOptionalString, toInteger } from '../../services/input.js';

export const readStringArg = (args: Record<string, unknown>, key: string): string | undefined =>
  readOptionalString(args[key]);

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
