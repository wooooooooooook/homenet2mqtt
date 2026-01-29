const SIGNATURE_FIELDS = [
  'data',
  'mask',
  'offset',
  'regex',
  'value',
  'length',
  'checksum',
  'header',
  'footer',
  'low_priority',
];

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const sorted: Record<string, unknown> = {};
    for (const [key, entryValue] of entries) {
      sorted[key] = sortKeys(entryValue);
    }
    return sorted;
  }

  return value;
};

const stableStringify = (value: unknown): string => JSON.stringify(sortKeys(value));

const buildSchemaSignature = (schema: unknown): unknown => {
  if (!schema) return null;

  if (Array.isArray(schema) || typeof schema === 'string' || typeof schema === 'number') {
    return sortKeys(schema);
  }

  if (typeof schema !== 'object') return null;

  const signature: Record<string, unknown> = {};
  for (const field of SIGNATURE_FIELDS) {
    if (field in (schema as Record<string, unknown>)) {
      signature[field] = sortKeys((schema as Record<string, unknown>)[field]);
    }
  }

  return Object.keys(signature).length > 0 ? signature : null;
};

export const buildEntitySignature = (
  entityType: string,
  entity: Record<string, unknown>,
): string | null => {
  const stateSignature = buildSchemaSignature(entity.state);
  const commands: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(entity)) {
    if (!key.startsWith('command_')) continue;
    const commandSignature = buildSchemaSignature(value);
    if (commandSignature) {
      commands[key] = commandSignature;
    }
  }

  if (!stateSignature && Object.keys(commands).length === 0) {
    return null;
  }

  return stableStringify({
    entityType,
    state: stateSignature,
    commands: Object.keys(commands).length > 0 ? commands : undefined,
  });
};
