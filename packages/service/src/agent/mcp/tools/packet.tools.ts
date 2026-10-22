import {
  AGENT_PACKET_SEND_MAX_COUNT,
  analyzeAgentPacket,
  sendAgentPacket,
} from '../../services/packet.service.js';
import type { McpTool } from '../types.js';

const draftSchema = {
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
  additionalProperties: false,
};

const portIdProperty = {
  type: 'string',
  description: 'Serial port id. Defaults to the only loaded port when omitted.',
};

export const packetTools: McpTool[] = [
  {
    name: 'analyze_packet',
    title: 'Analyze a packet',
    description:
      'Parse hex bytes (or an int array) against the active configuration or an unsaved draft configuration, returning matched packets, unmatched packets, automation matches, and draft validation issues.',
    inputSchema: {
      type: 'object',
      required: ['input'],
      properties: {
        portId: portIdProperty,
        input: {
          oneOf: [
            { type: 'string', description: 'Hex string, e.g. "AA55..."' },
            { type: 'array', items: { type: 'integer', minimum: 0, maximum: 255 } },
          ],
        },
        draft: draftSchema,
        similarityThreshold: { type: 'number', minimum: 0, maximum: 1 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (ctx, args) => ({
      data: await analyzeAgentPacket(ctx, {
        portId: args.portId,
        input: args.input,
        draft: args.draft,
        similarityThreshold: args.similarityThreshold,
      }),
    }),
  },
  {
    name: 'send_packet',
    title: 'Send a raw packet',
    description:
      'Send raw bytes on the RS485 bus. Disabled unless AGENT_ALLOW_PACKET_SEND=true. Requires confirm=true and is rate limited.',
    inputSchema: {
      type: 'object',
      required: ['hex', 'confirm'],
      properties: {
        portId: portIdProperty,
        hex: { type: 'string', description: 'Hex payload without header/footer/checksum.' },
        header: { type: 'boolean', description: 'Prepend the configured packet header.' },
        footer: { type: 'boolean', description: 'Append the configured packet footer.' },
        checksum: { type: 'boolean', description: 'Append the configured checksum.' },
        confirm: { type: 'boolean', const: true, description: 'Must be true to send.' },
        count: {
          type: 'integer',
          minimum: 1,
          maximum: AGENT_PACKET_SEND_MAX_COUNT,
          default: 1,
        },
        interval: {
          type: 'integer',
          minimum: 10,
          maximum: 1000,
          default: 100,
          description: 'Delay between repeated sends in milliseconds.',
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    requiresPacketSend: true,
    handler: async (ctx, args) => ({
      data: await sendAgentPacket(ctx, {
        portId: args.portId,
        hex: args.hex,
        header: args.header,
        footer: args.footer,
        checksum: args.checksum,
        confirm: args.confirm,
        count: args.count,
        interval: args.interval,
      }),
    }),
  },
];
