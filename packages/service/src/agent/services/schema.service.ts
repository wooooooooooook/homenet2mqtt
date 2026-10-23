import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigItemsError } from '../../services/config-items.service.js';
import { resolveSecurePath } from '../../utils/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Bundled JSON Schema files live in packages/core/static/schema.
// src/agent/services and dist/agent/services sit at the same depth, so four levels up is the
// package root in both layouts.
const SCHEMA_DIR = path.resolve(__dirname, '../../../../core/static/schema');
const SCHEMA_SUFFIX = '.schema.json';
const SCHEMA_NAME_PATTERN = /^[a-z0-9-]+$/;

export interface AgentSchemaList {
  schemas: string[];
}

export async function listAgentSchemas(): Promise<AgentSchemaList> {
  try {
    const entries = await fs.readdir(SCHEMA_DIR);
    const schemas = entries
      .filter((entry) => entry.endsWith(SCHEMA_SUFFIX))
      .map((entry) => entry.slice(0, -SCHEMA_SUFFIX.length))
      .sort();
    return { schemas };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { schemas: [] };
    throw err;
  }
}

export async function readAgentSchema(schemaName: string): Promise<Record<string, unknown>> {
  if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new ConfigItemsError('SCHEMA_NAME_INVALID', 'schemaName must match ^[a-z0-9-]+$.', 400);
  }

  const filePath = resolveSecurePath(SCHEMA_DIR, `${schemaName}${SCHEMA_SUFFIX}`);
  if (!filePath) {
    throw new ConfigItemsError('SCHEMA_NAME_INVALID', 'Invalid schema name.', 400);
  }

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const { schemas } = await listAgentSchemas();
      throw new ConfigItemsError('SCHEMA_NOT_FOUND', `Unknown schema "${schemaName}".`, 404, {
        available: schemas,
      });
    }
    throw err;
  }

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new ConfigItemsError(
      'SCHEMA_INVALID',
      `Bundled schema "${schemaName}" is not valid JSON.`,
      500,
    );
  }
}
