import { ConfigItemsError } from '../../services/config-items.service.js';
import type { AgentDraftInput } from './draft.service.js';

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const readOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const toInteger = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

export const parsePacketHexToBytes = (packet: string): number[] | null => {
  const matches = packet.match(/.{1,2}/g);
  if (!matches) return null;
  const bytes = matches.map((part) => Number.parseInt(part, 16));
  return bytes.some((value) => Number.isNaN(value)) ? null : bytes;
};

export const readDraftInput = (body: Record<string, unknown>): AgentDraftInput => ({
  entities: body.entities as AgentDraftInput['entities'],
  automations: body.automations,
  scripts: body.scripts,
  packetDefaults: body.packetDefaults as AgentDraftInput['packetDefaults'],
});

export const readSimilarityThreshold = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ConfigItemsError(
      'INVALID_SIMILARITY_THRESHOLD',
      'similarityThreshold must be a number.',
      400,
    );
  }
  return value;
};
