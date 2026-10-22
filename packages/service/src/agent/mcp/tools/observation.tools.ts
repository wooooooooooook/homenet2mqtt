import {
  AGENT_PACKET_HISTORY_DEFAULT_LIMIT,
  AGENT_PACKET_HISTORY_MAX_LIMIT,
  listAgentEntities,
  listAgentPacketHistory,
  listAgentPorts,
  listAgentStates,
  listAgentUnmatchedPackets,
} from '../../services/observation.service.js';
import type { McpTool } from '../types.js';
import { readIntegerArg, readStringArg } from './args.js';

const portIdProperty = {
  type: 'string',
  description: 'Serial port id. Defaults to the only loaded port when omitted.',
};

export const observationTools: McpTool[] = [
  {
    name: 'list_ports',
    title: 'List configured ports',
    description:
      'List loaded serial ports with their config file, bridge status, MQTT topic prefix, packet defaults, and entity counts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (ctx) => ({
      data: {
        ports: listAgentPorts({
          configs: ctx.getCurrentConfigs(),
          configFiles: ctx.getCurrentConfigFiles(),
          statuses: ctx.getCurrentConfigStatuses(),
        }),
      },
    }),
  },
  {
    name: 'get_entities',
    title: 'List entities',
    description:
      'List configured entities with their normalized port id, entity type, id, name, and full YAML configuration.',
    inputSchema: {
      type: 'object',
      properties: { portId: portIdProperty },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (ctx, args) => {
      const portId = readStringArg(args, 'portId');
      return {
        data: {
          portId: portId ?? null,
          entities: listAgentEntities(ctx.getCurrentConfigs(), portId),
        },
      };
    },
  },
  {
    name: 'get_entity_state',
    title: 'Get entity state snapshot',
    description: 'Return the latest state snapshot for every entity, optionally filtered by port.',
    inputSchema: {
      type: 'object',
      properties: { portId: portIdProperty },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (ctx, args) => {
      const portId = readStringArg(args, 'portId');
      return {
        data: { portId: portId ?? null, states: listAgentStates(ctx.getLatestStates(), portId) },
      };
    },
  },
  {
    name: 'get_packet_history',
    title: 'Get packet history',
    description:
      'Return merged parsed and command packet history, oldest first. Use limit to cap the most recent entries.',
    inputSchema: {
      type: 'object',
      properties: {
        portId: portIdProperty,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: AGENT_PACKET_HISTORY_MAX_LIMIT,
          default: AGENT_PACKET_HISTORY_DEFAULT_LIMIT,
        },
        since: { type: 'string', description: 'ISO timestamp; only newer entries are returned.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (ctx, args) => {
      const portId = readStringArg(args, 'portId');
      const limit = Math.min(
        Math.max(readIntegerArg(args, 'limit', AGENT_PACKET_HISTORY_DEFAULT_LIMIT), 1),
        AGENT_PACKET_HISTORY_MAX_LIMIT,
      );
      const since = readStringArg(args, 'since');
      const packets = listAgentPacketHistory(ctx.logRetentionService, { portId, limit, since });
      return { data: { portId: portId ?? null, count: packets.length, packets } };
    },
  },
  {
    name: 'get_unmatched_packets',
    title: 'Get unmatched packets',
    description:
      'List packets that matched no entity, with occurrence count and first/last seen timestamps.',
    inputSchema: {
      type: 'object',
      properties: { portId: portIdProperty },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (ctx, args) => {
      const portId = readStringArg(args, 'portId');
      const packets = listAgentUnmatchedPackets(ctx.logRetentionService, portId);
      return { data: { portId: portId ?? null, count: packets.length, packets } };
    },
  },
];
