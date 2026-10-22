import {
  applyAgentEntityDraft,
  validateAgentEntityDraft,
} from '../../services/entities.service.js';
import type { McpTool } from '../types.js';
import { readDraftArgs } from './args.js';

const portIdProperty = {
  type: 'string',
  description: 'Serial port id. Defaults to the only loaded port when omitted.',
};

const draftProperties = {
  entities: {
    type: 'object',
    additionalProperties: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
    description: 'Entities keyed by entity type (sensor, light, switch, ...).',
  },
  automations: { type: 'array', items: { type: 'object', additionalProperties: true } },
  scripts: { type: 'array', items: { type: 'object', additionalProperties: true } },
  packetDefaults: { type: 'object', additionalProperties: true },
};

export const entityTools: McpTool[] = [
  {
    name: 'validate_entity_draft',
    title: 'Validate an entity draft',
    description:
      'Validate proposed entities, automations, scripts, and packet defaults without writing configuration. Returns normalized output, errors, warnings, ID/signature conflicts, a draftHash for apply, and optional HA discovery previews.',
    inputSchema: {
      type: 'object',
      properties: {
        portId: portIdProperty,
        ...draftProperties,
        discoveryPreview: {
          type: 'boolean',
          default: false,
          description: 'Build Home Assistant MQTT discovery topic/payload previews when valid.',
        },
        similarityThreshold: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Threshold for signature-similarity conflict warnings.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (ctx, args) => {
      const result = await validateAgentEntityDraft(ctx, {
        portId: args.portId,
        draft: readDraftArgs(args),
        similarityThreshold: args.similarityThreshold,
        discoveryPreview: args.discoveryPreview,
      });
      return {
        data: { ...result.validation, portId: result.portId, discovery: result.discovery },
      };
    },
  },
  {
    name: 'apply_entity_draft',
    title: 'Apply an entity draft',
    description:
      'Write a validated draft to the YAML configuration. Requires the draftHash returned by validate_entity_draft. Creates a backup and marks a restart as required. Use resolutions/renames to handle exact ID conflicts.',
    inputSchema: {
      type: 'object',
      required: ['draftHash'],
      properties: {
        portId: portIdProperty,
        draftHash: {
          type: 'string',
          description: 'draftHash returned by validate_entity_draft for the same file and draft.',
        },
        ...draftProperties,
        resolutions: {
          type: 'object',
          additionalProperties: { type: 'string', enum: ['overwrite', 'skip'] },
          description: 'Resolve exact ID conflicts by draft id.',
        },
        renames: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Rename conflicting draft ids. Entity ids must match ^[A-Za-z0-9_-]+$.',
        },
        restart: {
          type: 'boolean',
          default: false,
          description: 'Restart the service after the configuration is written.',
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: async (ctx, args) => {
      const result = await applyAgentEntityDraft(ctx, {
        portId: args.portId,
        draft: readDraftArgs(args),
        draftHash: args.draftHash,
        resolutions: args.resolutions,
        renames: args.renames,
      });
      return {
        data: {
          success: true,
          portId: result.portId,
          backup: result.backup,
          applied: result.applied,
          draftHash: result.draftHash,
          restartRequired: true,
        },
        restartRequested: args.restart === true,
      };
    },
  },
];
