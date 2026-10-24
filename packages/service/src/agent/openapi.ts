import { AGENT_API_BASE, AGENT_PATHS } from './agent-paths.js';

const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
    },
  },
});

const jsonResponse = (description: string, schema: Record<string, unknown> | string) => ({
  description,
  content: {
    'application/json': {
      schema: typeof schema === 'string' ? { $ref: schema } : schema,
    },
  },
});

export interface OpenApiOptions {
  version: string;
}

const openApiPath = (path: string): string => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

export function buildOpenApiDocument(options: OpenApiOptions): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'homenet2mqtt Agent API',
      version: options.version,
      description:
        'RS485 packet observation, analysis, capture, and YAML entity registration for AI agents. An MCP Streamable HTTP endpoint exposes the same capabilities as tools.',
    },
    servers: [{ url: './' }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'meta' },
      { name: 'setup' },
      { name: 'observation' },
      { name: 'packets' },
      { name: 'capture' },
      { name: 'gallery' },
      { name: 'backups' },
      { name: 'bridges' },
      { name: 'schema' },
      { name: 'draft' },
      { name: 'events' },
      { name: 'mcp' },
    ],
    paths: {
      [AGENT_PATHS.openapi]: {
        get: {
          tags: ['meta'],
          summary: 'OpenAPI document',
          security: [],
          responses: { '200': { description: 'OpenAPI 3.1 document' } },
        },
      },
      [AGENT_PATHS.llms]: {
        get: {
          tags: ['meta'],
          summary: 'Plain-text agent guide',
          security: [],
          responses: { '200': { description: 'Agent usage guide', content: { 'text/plain': {} } } },
        },
      },
      [AGENT_PATHS.capabilities]: {
        get: {
          tags: ['meta'],
          summary: 'API capabilities and limits',
          responses: { '200': jsonResponse('Capabilities', { type: 'object' }) },
        },
      },
      [AGENT_PATHS.setup]: {
        get: {
          tags: ['setup'],
          summary: 'Setup state, bundled examples, and loaded port ids',
          description:
            'setupRequired is true only while no configuration is loaded. loadedPortIds lists portIds already in use when adding a bridge.',
          responses: { '200': jsonResponse('Setup state', { type: 'object' }) },
        },
      },
      [openApiPath(AGENT_PATHS.setupExample)]: {
        get: {
          tags: ['setup'],
          summary: 'Inspect a setup example',
          description:
            'Returns serial defaults (without path), packet defaults, and selectable entity ids. Use "__empty__" for a blank configuration.',
          parameters: [
            { name: 'filename', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': jsonResponse('Example details', { type: 'object' }),
            '404': errorResponse('Example not found'),
          },
        },
      },
      [AGENT_PATHS.setupTestSerial]: {
        post: {
          tags: ['setup'],
          summary: 'Test a serial port during setup or bridge addition',
          description:
            'Available regardless of loaded configuration, but the port must not already be held by a running bridge.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SetupSelectionRequest' },
              },
            },
          },
          responses: {
            '200': jsonResponse('Captured packets', { type: 'object' }),
            '400': errorResponse('Invalid serial configuration'),
            '409': errorResponse('A serial test is already running'),
          },
        },
      },
      [AGENT_PATHS.setupApply]: {
        post: {
          tags: ['setup'],
          summary: 'Apply initial setup or add another bridge',
          description:
            'mode="init" (default) seeds the default config from an example or "__empty__", writes a backup, marks initialization complete, and requires that no configuration is loaded. mode="add" writes a new config file while configurations are loaded and rejects duplicate portId or serialPath values. Restarts after responding unless restart=false.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SetupSelectionRequest' },
              },
            },
          },
          responses: {
            '200': jsonResponse('Configuration applied', { type: 'object' }),
            '400': errorResponse(
              'Invalid example, serial path, serial configuration, or duplicate portId/serialPath',
            ),
            '409': errorResponse('A configuration is already loaded and mode is not "add"'),
          },
        },
      },
      [AGENT_PATHS.ports]: {
        get: {
          tags: ['observation'],
          summary: 'List configured ports',
          responses: { '200': jsonResponse('Ports', { type: 'object' }) },
        },
      },
      [AGENT_PATHS.entities]: {
        get: {
          tags: ['observation'],
          summary: 'List entities',
          parameters: [{ $ref: '#/components/parameters/PortId' }],
          responses: { '200': jsonResponse('Entities', { type: 'object' }) },
        },
      },
      [openApiPath(AGENT_PATHS.entity)]: {
        get: {
          tags: ['observation'],
          summary: 'Get one entity configuration',
          parameters: [
            { name: 'entityId', in: 'path', required: true, schema: { type: 'string' } },
            { $ref: '#/components/parameters/PortId' },
          ],
          responses: {
            '200': jsonResponse('Entity', { type: 'object' }),
            '404': errorResponse('Entity not found'),
          },
        },
      },
      [AGENT_PATHS.automations]: {
        get: {
          tags: ['observation'],
          summary: 'List automations',
          description:
            'List configured automations with their normalized port id, id, name, and full YAML configuration.',
          parameters: [{ $ref: '#/components/parameters/PortId' }],
          responses: { '200': jsonResponse('Automations', { type: 'object' }) },
        },
      },
      [openApiPath(AGENT_PATHS.automation)]: {
        get: {
          tags: ['observation'],
          summary: 'Get one automation configuration',
          parameters: [
            { name: 'automationId', in: 'path', required: true, schema: { type: 'string' } },
            { $ref: '#/components/parameters/PortId' },
          ],
          responses: {
            '200': jsonResponse('Automation', { type: 'object' }),
            '404': errorResponse('Automation not found'),
          },
        },
      },
      [AGENT_PATHS.scripts]: {
        get: {
          tags: ['observation'],
          summary: 'List scripts',
          description:
            'List configured scripts with their normalized port id, id, description, and full YAML configuration.',
          parameters: [{ $ref: '#/components/parameters/PortId' }],
          responses: { '200': jsonResponse('Scripts', { type: 'object' }) },
        },
      },
      [openApiPath(AGENT_PATHS.script)]: {
        get: {
          tags: ['observation'],
          summary: 'Get one script configuration',
          parameters: [
            { name: 'scriptId', in: 'path', required: true, schema: { type: 'string' } },
            { $ref: '#/components/parameters/PortId' },
          ],
          responses: {
            '200': jsonResponse('Script', { type: 'object' }),
            '404': errorResponse('Script not found'),
          },
        },
      },
      [AGENT_PATHS.state]: {
        get: {
          tags: ['observation'],
          summary: 'Get latest entity state snapshot',
          parameters: [{ $ref: '#/components/parameters/PortId' }],
          responses: { '200': jsonResponse('States', { type: 'object' }) },
        },
      },
      [AGENT_PATHS.packetHistory]: {
        get: {
          tags: ['packets'],
          summary: 'Merged parsed/command packet history',
          parameters: [
            { $ref: '#/components/parameters/PortId' },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 200, maximum: 1000 },
            },
            {
              name: 'since',
              in: 'query',
              schema: { type: 'string' },
              description: 'ISO timestamp',
            },
          ],
          responses: { '200': jsonResponse('Packet history', { type: 'object' }) },
        },
      },
      [AGENT_PATHS.packetUnmatched]: {
        get: {
          tags: ['packets'],
          summary: 'Unmatched packets with counts and timestamps',
          parameters: [{ $ref: '#/components/parameters/PortId' }],
          responses: { '200': jsonResponse('Unmatched packets', { type: 'object' }) },
        },
      },
      [AGENT_PATHS.packetAnalyze]: {
        post: {
          tags: ['packets'],
          summary: 'Analyze packet bytes with active or draft configuration',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['input'],
                  properties: {
                    portId: { type: 'string' },
                    input: {
                      oneOf: [
                        { type: 'string' },
                        { type: 'array', items: { type: 'integer', minimum: 0, maximum: 255 } },
                      ],
                    },
                    draft: { $ref: '#/components/schemas/DraftInput' },
                    similarityThreshold: { type: 'number', minimum: 0, maximum: 1 },
                  },
                },
              },
            },
          },
          responses: {
            '200': jsonResponse('Analysis result', { type: 'object' }),
            '400': errorResponse('Invalid input'),
          },
        },
      },
      [AGENT_PATHS.packetPreview]: {
        post: {
          tags: ['packets'],
          summary: 'Build an outgoing packet without sending it',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PacketBuildRequest' },
              },
            },
          },
          responses: {
            '200': jsonResponse('Preview', { type: 'object' }),
            '400': errorResponse('Invalid packet'),
          },
        },
      },
      [AGENT_PATHS.packetSend]: {
        post: {
          tags: ['packets'],
          summary: 'Send raw bytes on the RS485 bus (opt-in)',
          description:
            'Requires packet sending to be enabled in Settings > Agent API, and confirm=true.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PacketBuildRequest' },
                    {
                      type: 'object',
                      required: ['confirm'],
                      properties: {
                        confirm: { type: 'boolean', const: true },
                        count: { type: 'integer', minimum: 1, maximum: 10, default: 1 },
                        interval: { type: 'integer', minimum: 10, maximum: 1000, default: 100 },
                      },
                    },
                  ],
                },
              },
            },
          },
          responses: {
            '200': jsonResponse('Send result', { type: 'object' }),
            '403': errorResponse('Packet sending is disabled'),
            '429': errorResponse('Rate limited'),
          },
        },
      },
      [AGENT_PATHS.capture]: {
        get: {
          tags: ['capture'],
          summary: 'Raw packet capture status',
          responses: { '200': jsonResponse('Capture status', { type: 'object' }) },
        },
      },
      [AGENT_PATHS.captureStart]: {
        post: {
          tags: ['capture'],
          summary: 'Start raw packet capture',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { mode: { type: 'string', enum: ['all', 'valid'], default: 'all' } },
                },
              },
            },
          },
          responses: { '200': jsonResponse('Capture status', { type: 'object' }) },
        },
      },
      [AGENT_PATHS.captureStop]: {
        post: {
          tags: ['capture'],
          summary: 'Stop raw packet capture',
          responses: { '200': jsonResponse('Capture result', { type: 'object' }) },
        },
      },
      [AGENT_PATHS.captureFiles]: {
        get: {
          tags: ['capture'],
          summary: 'List capture files',
          responses: { '200': jsonResponse('Capture files', { type: 'object' }) },
        },
      },
      [openApiPath(AGENT_PATHS.captureFile)]: {
        get: {
          tags: ['capture'],
          summary: 'Download a capture file',
          parameters: [
            { name: 'filename', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Plain-text capture file', content: { 'text/plain': {} } },
            '404': errorResponse('File not found'),
          },
        },
        delete: {
          tags: ['capture'],
          summary: 'Delete a capture file',
          parameters: [
            { name: 'filename', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': jsonResponse('Deleted', { type: 'object' }),
            '404': errorResponse('File not found'),
          },
        },
      },
      [AGENT_PATHS.events]: {
        get: {
          tags: ['events'],
          summary: 'Server-Sent Events stream',
          parameters: [
            {
              name: 'types',
              in: 'query',
              schema: { type: 'string' },
              description:
                'Comma-separated: state,parsed-packet,unmatched-packet,command-packet,bridge-status,raw',
            },
            { $ref: '#/components/parameters/PortId' },
            { name: 'raw', in: 'query', schema: { type: 'string', enum: ['all', 'valid'] } },
            { name: 'sinceId', in: 'query', schema: { type: 'integer' } },
          ],
          responses: {
            '200': {
              description: 'text/event-stream',
              content: { 'text/event-stream': { schema: { type: 'string' } } },
            },
            '429': errorResponse('Too many concurrent streams'),
          },
        },
      },
      [AGENT_PATHS.entitiesValidate]: {
        post: {
          tags: ['draft'],
          summary: 'Validate a draft without writing configuration',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/DraftInput' },
                    {
                      type: 'object',
                      properties: {
                        portId: { type: 'string' },
                        discoveryPreview: { type: 'boolean', default: false },
                        similarityThreshold: { type: 'number', minimum: 0, maximum: 1 },
                      },
                    },
                  ],
                },
              },
            },
          },
          responses: { '200': jsonResponse('Validation result', { type: 'object' }) },
        },
      },
      [AGENT_PATHS.entitiesApply]: {
        post: {
          tags: ['draft'],
          summary: 'Apply a validated draft to the YAML configuration',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/DraftInput' },
                    {
                      type: 'object',
                      required: ['draftHash'],
                      properties: {
                        portId: { type: 'string' },
                        draftHash: { type: 'string' },
                        resolutions: {
                          type: 'object',
                          additionalProperties: { type: 'string', enum: ['overwrite', 'skip'] },
                        },
                        renames: {
                          type: 'object',
                          additionalProperties: { type: 'string' },
                        },
                        restart: { type: 'boolean', default: false },
                      },
                    },
                  ],
                },
              },
            },
          },
          responses: {
            '200': jsonResponse('Applied', { type: 'object' }),
            '409': errorResponse('Stale draft or unresolved conflict'),
            '422': errorResponse('Draft invalid'),
          },
        },
      },
      [AGENT_PATHS.gallery]: {
        get: {
          tags: ['gallery'],
          summary: 'List gallery vendors, or the snippet index for one vendor',
          description:
            "Without `vendor`, lists every vendor id, its requirements, snippet count and entity types. With `vendor`, returns that vendor's snippets including parameters, content summary and the discovery block used to score them against observed packets. Resolved from GitHub first, then the packaged gallery directory.",
          parameters: [
            {
              name: 'vendor',
              in: 'query',
              schema: { type: 'string' },
              description: 'Vendor id such as "commax".',
            },
          ],
          responses: {
            '200': jsonResponse('Gallery index', { type: 'object' }),
            '404': errorResponse('Vendor not found'),
            '503': errorResponse('Gallery list unavailable'),
          },
        },
      },
      [AGENT_PATHS.gallerySnippet]: {
        get: {
          tags: ['gallery'],
          summary: 'Read one gallery snippet as raw YAML',
          parameters: [
            {
              name: 'file',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Gallery-relative path, e.g. "commax/heaters_new.yaml".',
            },
          ],
          responses: {
            '200': jsonResponse('Snippet YAML', { type: 'object' }),
            '400': errorResponse('Invalid file path'),
            '404': errorResponse('Snippet not found'),
          },
        },
      },
      [AGENT_PATHS.galleryMatch]: {
        get: {
          tags: ['gallery'],
          summary: 'Score gallery snippets against observed packets',
          description:
            "Runs each snippet's discovery block against the packet dictionary and unmatched packets, then returns matches sorted by matched packet count with the inferred parameter values (e.g. channel counts). Requires log retention to be enabled.",
          parameters: [
            { $ref: '#/components/parameters/PortId' },
            { name: 'vendor', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': jsonResponse('Match report', { type: 'object' }),
            '404': errorResponse('Port or vendor not found'),
          },
        },
      },
      [AGENT_PATHS.galleryExpand]: {
        post: {
          tags: ['gallery'],
          summary: 'Expand a gallery snippet into a draft',
          description:
            "Resolves the snippet's parameters (defaults plus any overrides), expands its $repeat, $if and {{expr}} templates, and returns a draft with entities, automations and scripts. Feed the draft to /entities/validate, then /entities/apply. The resolved parameterValues and item counts are returned alongside the draft.",
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: {
                      type: 'string',
                      description: 'Gallery-relative path, e.g. "commax/heaters_new.yaml".',
                    },
                    parameterValues: {
                      type: 'object',
                      additionalProperties: true,
                      description:
                        'Parameter overrides keyed by parameter name; missing values use gallery defaults.',
                    },
                    portId: {
                      type: 'string',
                      description: 'Optional port id; validated against the loaded configuration.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': jsonResponse('Expanded draft', { type: 'object' }),
            '400': errorResponse('Invalid file, parameters, YAML or expansion'),
            '404': errorResponse('Snippet or port not found'),
          },
        },
      },
      [AGENT_PATHS.backups]: {
        get: {
          tags: ['backups'],
          summary: 'List configuration backups',
          description:
            'Lists YAML backups of configuration files, newest first. Filter by portId or configFile when more than one bridge is loaded.',
          parameters: [
            { $ref: '#/components/parameters/PortId' },
            {
              name: 'configFile',
              in: 'query',
              schema: { type: 'string' },
              description: 'Configuration filename such as "default.homenet_bridge.yaml".',
            },
          ],
          responses: { '200': jsonResponse('Backups', { type: 'object' }) },
        },
        post: {
          tags: ['backups'],
          summary: 'Create a configuration backup',
          description:
            'Snapshots the current configuration YAML into the backups directory and returns its metadata with the YAML content. Use it before applying a draft or gallery preset so the agent keeps a pristine copy.',
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateBackupRequest' },
              },
            },
          },
          responses: {
            '200': jsonResponse('Created backup', { type: 'object' }),
            '404': errorResponse('Port or configuration file not found'),
          },
        },
      },
      [AGENT_PATHS.backupRestore]: {
        post: {
          tags: ['backups'],
          summary: 'Restore a configuration backup',
          description:
            'Overwrites the source configuration file with the selected backup, writes a pre_restore backup first, and refreshes the loaded bridge config. Requires confirm=true; restarts after responding unless restart=false.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RestoreBackupRequest' },
              },
            },
          },
          responses: {
            '200': jsonResponse('Restored backup', { type: 'object' }),
            '400': errorResponse('Missing confirmation or invalid backup'),
            '404': errorResponse('Backup not found'),
          },
        },
      },
      [openApiPath(AGENT_PATHS.backup)]: {
        get: {
          tags: ['backups'],
          summary: 'Download a configuration backup',
          description:
            'Returns backup metadata and YAML. Add raw=true to download the YAML as a text/yaml attachment.',
          parameters: [
            {
              name: 'filename',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Backup filename returned by the list or create endpoint.',
            },
            {
              name: 'raw',
              in: 'query',
              schema: { type: 'boolean', default: false },
              description: 'Return the YAML file instead of JSON metadata.',
            },
          ],
          responses: {
            '200': jsonResponse('Backup content', { type: 'object' }),
            '400': errorResponse('Invalid backup filename'),
            '404': errorResponse('Backup not found'),
          },
        },
      },
      [AGENT_PATHS.bridgeDelete]: {
        post: {
          tags: ['bridges'],
          summary: 'Delete a bridge configuration',
          description:
            'Deletes the configuration YAML after verifying that backupFilename is a backup of the exact current file. Requires confirm=true; rejects missing, mismatched or stale backups. Restarts the service after responding. Deleting the last configuration reopens the setup wizard.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteBridgeRequest' },
              },
            },
          },
          responses: {
            '200': jsonResponse('Deleted configuration', { type: 'object' }),
            '400': errorResponse('Missing confirmation, missing backup or mismatched backup'),
            '404': errorResponse('Port, config file or backup not found'),
            '409': errorResponse('Backup is stale and does not match the current YAML'),
          },
        },
      },
      [AGENT_PATHS.schema]: {
        get: {
          tags: ['schema'],
          summary: 'List bundled configuration schemas',
          description:
            'Lists the JSON Schema files shipped with this build. Use the config schema (homenet-bridge) to look up entity field names, enums and required flags instead of guessing them.',
          responses: {
            '200': jsonResponse('Schema names', { type: 'object' }),
          },
        },
      },
      [openApiPath(AGENT_PATHS.schemaFile)]: {
        get: {
          tags: ['schema'],
          summary: 'Get one bundled JSON Schema',
          description:
            'Returns the JSON Schema used by the YAML editor for this version. The document is large (about 120KB), so request it only when you need exact field names, enum values or constraints for an entity draft.',
          parameters: [
            {
              name: 'schemaName',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[a-z0-9-]+$' },
              description: 'Schema name such as "homenet-bridge".',
            },
          ],
          responses: {
            '200': jsonResponse('JSON Schema', { type: 'object' }),
            '400': errorResponse('Invalid schema name'),
            '404': errorResponse('Schema not found'),
          },
        },
      },
      [AGENT_PATHS.mcp]: {
        post: {
          tags: ['mcp'],
          summary: 'MCP Streamable HTTP endpoint (JSON-RPC 2.0)',
          description:
            'Stateless MCP server. Supports initialize, ping, tools/list, tools/call, and the notifications/initialized notification. Tool names and input schemas are discoverable via tools/list.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/JsonRpcRequest' },
                    {
                      type: 'array',
                      items: { $ref: '#/components/schemas/JsonRpcRequest' },
                    },
                  ],
                },
              },
            },
          },
          responses: {
            '200': jsonResponse('JSON-RPC response or batch', { type: 'object' }),
            '202': { description: 'Notification accepted (no response body)' },
            '400': errorResponse('Invalid JSON-RPC request'),
            '415': errorResponse('Content-Type must be application/json'),
          },
        },
        get: {
          tags: ['mcp'],
          summary: 'MCP SSE stream (not supported)',
          responses: { '405': errorResponse('Only POST is supported') },
        },
        delete: {
          tags: ['mcp'],
          summary: 'MCP session termination (stateless, not supported)',
          responses: { '405': errorResponse('Only POST is supported') },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Set Authorization: Bearer <agent API token issued in Settings > Agent API>',
        },
      },
      parameters: {
        PortId: {
          name: 'portId',
          in: 'query',
          required: false,
          schema: { type: 'string' },
          description: 'Serial port id. Defaults to the only loaded port when omitted.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object', additionalProperties: true },
          },
        },
        DraftInput: {
          type: 'object',
          properties: {
            entities: {
              type: 'object',
              additionalProperties: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
            },
            automations: { type: 'array', items: { type: 'object', additionalProperties: true } },
            scripts: { type: 'array', items: { type: 'object', additionalProperties: true } },
            packetDefaults: { type: 'object', additionalProperties: true },
          },
        },
        PacketBuildRequest: {
          type: 'object',
          required: ['hex'],
          properties: {
            portId: { type: 'string' },
            hex: { type: 'string', description: 'Hex payload without header/footer/checksum' },
            header: { type: 'boolean', description: 'Prepend the configured packet header' },
            footer: { type: 'boolean', description: 'Append the configured packet footer' },
            checksum: { type: 'boolean', description: 'Append the configured checksum' },
          },
        },
        SetupSelectionRequest: {
          type: 'object',
          required: ['example'],
          properties: {
            example: {
              type: 'string',
              description: 'Example filename from GET /setup, or "__empty__" for a blank config.',
            },
            mode: {
              type: 'string',
              enum: ['init', 'add'],
              default: 'init',
              description:
                'Use "init" for first-time setup, or "add" to add another bridge with a unique portId.',
            },
            serialPath: {
              type: 'string',
              description: 'Device path or host:port. Required for example configurations.',
            },
            portId: { type: 'string' },
            serialConfig: {
              type: 'object',
              additionalProperties: true,
              description:
                'Full serial settings for "__empty__": portId, path, baud_rate, data_bits, parity, stop_bits.',
            },
            packetDefaults: { type: 'object', additionalProperties: true },
            selectedEntities: {
              type: 'object',
              additionalProperties: { type: 'array', items: { type: 'string' } },
            },
            restart: { type: 'boolean', default: true },
          },
        },
        CreateBackupRequest: {
          type: 'object',
          properties: {
            portId: { type: 'string' },
            configFile: {
              type: 'string',
              description:
                'Configuration filename such as "default.homenet_bridge.yaml". Alternative to portId.',
            },
            reason: {
              type: 'string',
              pattern: '^[A-Za-z0-9_-]{1,60}$',
              default: 'agent_backup',
              description: 'Short label recorded in the backup filename.',
            },
          },
        },
        RestoreBackupRequest: {
          type: 'object',
          required: ['filename', 'confirm'],
          properties: {
            filename: {
              type: 'string',
              description: 'Backup filename returned by the list or create endpoint.',
            },
            confirm: {
              type: 'boolean',
              const: true,
              description: 'Must be true. Restoring overwrites the configuration YAML.',
            },
            restart: {
              type: 'boolean',
              default: true,
              description: 'Restart the service after the configuration is restored.',
            },
          },
        },
        DeleteBridgeRequest: {
          type: 'object',
          required: ['backupFilename', 'confirm'],
          properties: {
            portId: {
              type: 'string',
              description: 'Serial port id. Defaults to the only loaded port when omitted.',
            },
            configFile: {
              type: 'string',
              description:
                'Configuration filename such as "default.homenet_bridge.yaml". Alternative to portId.',
            },
            backupFilename: {
              type: 'string',
              description:
                'Backup filename returned by create_backup or list_backups. It must match the current YAML byte for byte.',
            },
            confirm: {
              type: 'boolean',
              const: true,
              description: 'Must be true. Deleting removes the configuration YAML.',
            },
          },
        },
        JsonRpcRequest: {
          type: 'object',
          required: ['jsonrpc', 'method'],
          properties: {
            jsonrpc: { const: '2.0' },
            id: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
            method: { type: 'string' },
            params: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  };
}

export const AGENT_LLMS_TXT = `# homenet2mqtt Agent API

Base URL: ${AGENT_API_BASE}
Auth: Authorization: Bearer <agent API token> (required for every endpoint except openapi.json and llms.txt)
OpenAPI: ${AGENT_API_BASE}${AGENT_PATHS.openapi}

## Workflow
0. If no configuration is loaded yet, call GET /setup. Inspect an example with GET /setup/examples/<filename>, optionally POST /setup/test-serial, then POST /setup/apply { mode: "init", example, serialPath, portId?, packetDefaults?, selectedEntities?, restart }.
   To add another bridge while configurations are loaded, read loadedPortIds from GET /setup, optionally POST /setup/test-serial, then POST /setup/apply { mode: "add", example, serialPath, portId, ... } with a portId not already in loadedPortIds.
1. GET /ports, GET /entities, GET /automations, and GET /scripts to inspect the loaded configuration.
2. GET /state, GET /packets/history, and GET /packets/unmatched to observe traffic.
3. POST /packets/analyze with \`input\` (hex or int array) and an optional \`draft\` config.
4. POST /capture/start { "mode": "all" | "valid" } and POST /capture/stop to record raw bytes.
5. Before changing an existing configuration, POST /backups { portId?, configFile?, reason? } to snapshot it; GET /backups/<filename> returns the YAML so the agent can keep a pristine copy.
6. POST /entities/validate { portId, entities, automations, scripts, packetDefaults, discoveryPreview }.
7. POST /entities/apply { portId, draftHash, ...draft, resolutions, renames, restart }.
8. The service writes YAML, creates a backup, and marks a restart as required.
9. If a change must be rolled back, POST /backups/restore { filename, confirm: true, restart? }; the current YAML is backed up first.
10. To remove a bridge entirely, POST /bridges/delete { portId? | configFile?, backupFilename, confirm: true }. The backup must match the current YAML byte for byte; the service deletes the file and restarts. Deleting the last configuration reopens the setup wizard.

## Notes
- Config schema: GET /schema lists the bundled JSON Schema names; GET /schema/homenet-bridge returns the config schema for this build (entity fields, enums, required flags). The same schema is available over MCP as list_config_schemas and get_config_schema. Look up exact field names there instead of guessing them.
- Gallery presets: GET /gallery lists vendors (id, requirements, snippetCount, entityTypes); GET /gallery?vendor=<id> returns that vendor's snippets with parameters, content summary and discovery block; GET /gallery/snippet?file=<vendor>/<name>.yaml returns the raw YAML; GET /gallery/match?portId=&vendor= scores every snippet's discovery against observed packets and returns inferred parameter values (channel counts); POST /gallery/expand { file, parameterValues? } resolves parameters and expands $repeat/$if/{{expr}} templates into a draft with entities, automations and scripts ready for /entities/validate. GitHub is read first and the packaged gallery directory is the offline fallback, so \`source\` in the response tells you which one served the data. Use these to extend entities until /packets/unmatched is empty.
- Configuration backups: GET /backups?portId=&configFile= lists backups newest first; POST /backups { portId?, configFile?, reason? } snapshots the current YAML and returns its content; GET /backups/<filename> returns metadata plus YAML (raw=true downloads the YAML); POST /backups/restore { filename, confirm: true, restart? } restores the source config file, writes a pre_restore backup first, and restarts the service. Use them to keep a pristine copy before edits and to roll back.
- Bridge deletion: POST /bridges/delete { portId? | configFile?, backupFilename, confirm: true } deletes the YAML only when backupFilename is a backup of the exact current content; missing, mismatched or stale backups are rejected. Always restarts the service; deleting the last configuration reopens the setup wizard.
- /setup/apply with mode "init" (default) requires that no configuration is loaded; mode "add" writes a new config file while configurations are loaded and requires a unique portId and serialPath. Use "__empty__" as the example to start from a blank config; then serialConfig { portId, path, baud_rate, data_bits, parity, stop_bits } is required.
- /setup/test-serial is available with or without loaded configurations, but the port must not already be held by a running bridge.
- POST /setup/apply restarts the service after responding unless restart=false.
- Draft ids must match ^[A-Za-z0-9_-]+$.
- \`applicable\` is false when exact ID conflicts remain. Use resolutions { "<id>": "overwrite" | "skip" } or renames { "<id>": "<new_id>" } when applying.
- Packet sending is disabled unless it is enabled in Settings > Agent API. Sending also requires confirm=true and count <= 10.
- GET /events is an SSE stream. Optional query: types, portId, raw=all|valid, sinceId. Send Last-Event-ID to replay buffered events (max 500).
- Legacy /api/* endpoints belong to the bundled UI and require the UI session cookie (or a trusted Home Assistant ingress request); they are not part of this API.

## MCP
Endpoint: POST ${AGENT_API_BASE}${AGENT_PATHS.mcp} (MCP Streamable HTTP, JSON-RPC 2.0, stateless)
Auth: same Authorization: Bearer header. Send Content-Type: application/json.
Methods: initialize, notifications/initialized (202, no body), ping, tools/list, tools/call.
Tools: get_setup_state, get_setup_example, test_setup_serial, apply_initial_setup, list_ports, get_entities, get_automations, get_scripts, get_entity_state, get_packet_history, get_unmatched_packets, analyze_packet,
start_capture, stop_capture, get_capture_status, list_capture_files, validate_entity_draft, apply_entity_draft,
get_recent_events (poll with afterId), list_gallery, get_gallery_snippet, match_gallery, expand_gallery_snippet, list_config_schemas, get_config_schema,
list_backups, create_backup, get_backup, restore_backup, delete_bridge, and send_packet when packet sending is enabled in Settings > Agent API.
Tool failures are returned as tool results with isError=true and { error, message }; protocol errors use JSON-RPC error codes.
`;
