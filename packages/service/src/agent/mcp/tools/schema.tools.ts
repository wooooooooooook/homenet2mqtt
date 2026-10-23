import { listAgentSchemas, readAgentSchema } from '../../services/schema.service.js';
import type { McpTool } from '../types.js';
import { readStringArg } from './args.js';

const DEFAULT_SCHEMA = 'homenet-bridge';

export const schemaTools: McpTool[] = [
  {
    name: 'list_config_schemas',
    title: 'List configuration schemas',
    description:
      'List the JSON Schema names bundled with this build, e.g. "homenet-bridge" (entity fields, enums, required flags).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async () => ({ data: await listAgentSchemas() }),
  },
  {
    name: 'get_config_schema',
    title: 'Get a configuration schema',
    description:
      'Return one bundled JSON Schema, default "homenet-bridge". Use it to look up entity field names, enum values and required flags instead of guessing them; the config schema keeps its definitions under "definitions" (ClimateEntity, LightEntity, StateSchema, PacketDefaults, ...). The document is large (about 120KB), so request it only when exact fields are needed.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Schema name from list_config_schemas. Defaults to "homenet-bridge".',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (_ctx, args) => {
      const name = readStringArg(args, 'name') ?? DEFAULT_SCHEMA;
      return { data: await readAgentSchema(name) };
    },
  },
];
