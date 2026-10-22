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
      { name: 'observation' },
      { name: 'packets' },
      { name: 'capture' },
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
          description: 'Requires AGENT_ALLOW_PACKET_SEND=true and confirm=true.',
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
          description: 'Set Authorization: Bearer <AGENT_API_TOKEN>',
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
Auth: Authorization: Bearer <AGENT_API_TOKEN> (required for every endpoint except openapi.json and llms.txt)
OpenAPI: ${AGENT_API_BASE}${AGENT_PATHS.openapi}

## Workflow
1. GET /ports and GET /entities to inspect the loaded configuration.
2. GET /state, GET /packets/history, and GET /packets/unmatched to observe traffic.
3. POST /packets/analyze with \`input\` (hex or int array) and an optional \`draft\` config.
4. POST /capture/start { "mode": "all" | "valid" } and POST /capture/stop to record raw bytes.
5. POST /entities/validate { portId, entities, automations, scripts, packetDefaults, discoveryPreview }.
6. POST /entities/apply { portId, draftHash, ...draft, resolutions, renames, restart }.
7. The service writes YAML, creates a backup, and marks a restart as required.

## Notes
- Draft ids must match ^[A-Za-z0-9_-]+$.
- \`applicable\` is false when exact ID conflicts remain. Use resolutions { "<id>": "overwrite" | "skip" } or renames { "<id>": "<new_id>" } when applying.
- Packet sending is disabled unless AGENT_ALLOW_PACKET_SEND=true. Sending also requires confirm=true and count <= 10.
- GET /events is an SSE stream. Optional query: types, portId, raw=all|valid, sinceId. Send Last-Event-ID to replay buffered events (max 500).
- Legacy /api/* endpoints remain unauthenticated for the bundled UI.

## MCP
Endpoint: POST ${AGENT_API_BASE}${AGENT_PATHS.mcp} (MCP Streamable HTTP, JSON-RPC 2.0, stateless)
Auth: same Authorization: Bearer header. Send Content-Type: application/json.
Methods: initialize, notifications/initialized (202, no body), ping, tools/list, tools/call.
Tools: list_ports, get_entities, get_entity_state, get_packet_history, get_unmatched_packets, analyze_packet,
start_capture, stop_capture, get_capture_status, list_capture_files, validate_entity_draft, apply_entity_draft,
get_recent_events (poll with afterId), and send_packet when AGENT_ALLOW_PACKET_SEND=true.
Tool failures are returned as tool results with isError=true and { error, message }; protocol errors use JSON-RPC error codes.
`;
