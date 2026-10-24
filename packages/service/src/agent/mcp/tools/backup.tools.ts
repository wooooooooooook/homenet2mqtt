import {
  createAgentBackup,
  getAgentBackup,
  listAgentBackups,
  restoreAgentBackup,
} from '../../services/backups.service.js';
import type { McpTool } from '../types.js';
import { readStringArg } from './args.js';

const portIdProperty = {
  type: 'string',
  description: 'Serial port id. Defaults to the only loaded port when omitted.',
};

const configFileProperty = {
  type: 'string',
  description:
    'Configuration YAML filename such as "default.homenet_bridge.yaml". Alternative to portId.',
};

const filenameProperty = {
  type: 'string',
  description: 'Backup filename returned by list_backups or create_backup.',
};

export const backupTools: McpTool[] = [
  {
    name: 'list_backups',
    title: 'List configuration backups',
    description:
      'List configuration YAML backups with filename, source config file, reason, size and creation time, newest first. Filter by portId or configFile when the service loads more than one bridge.',
    inputSchema: {
      type: 'object',
      properties: {
        portId: portIdProperty,
        configFile: configFileProperty,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (ctx, args) => ({
      data: await listAgentBackups(ctx, {
        portId: readStringArg(args, 'portId'),
        configFile: readStringArg(args, 'configFile'),
      }),
    }),
  },
  {
    name: 'create_backup',
    title: 'Create a configuration backup',
    description:
      'Snapshot the current configuration YAML into the backups directory and return its metadata together with the YAML content, so you can keep a pristine copy before editing or applying a draft. Use a short reason such as "before_gallery_apply".',
    inputSchema: {
      type: 'object',
      properties: {
        portId: portIdProperty,
        configFile: configFileProperty,
        reason: {
          type: 'string',
          pattern: '^[A-Za-z0-9_-]{1,60}$',
          default: 'agent_backup',
          description: 'Short label recorded in the backup filename.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: async (ctx, args) => ({
      data: { created: true, backup: await createAgentBackup(ctx, args) },
    }),
  },
  {
    name: 'get_backup',
    title: 'Download a configuration backup',
    description:
      'Return one backup as YAML together with its metadata and byte size. The backup filename must come from list_backups or create_backup.',
    inputSchema: {
      type: 'object',
      required: ['filename'],
      properties: { filename: filenameProperty },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (ctx, args) => ({
      data: await getAgentBackup(ctx, readStringArg(args, 'filename')),
    }),
  },
  {
    name: 'restore_backup',
    title: 'Restore a configuration backup',
    description:
      'Overwrite the source configuration file with a backup and refresh the in-memory bridge config. A pre_restore backup of the current YAML is written first. Requires confirm=true, and restarts the service after responding unless restart=false.',
    inputSchema: {
      type: 'object',
      required: ['filename', 'confirm'],
      properties: {
        filename: filenameProperty,
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
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: async (ctx, args) => {
      const result = await restoreAgentBackup(ctx, {
        filename: args.filename,
        confirm: args.confirm,
      });
      const restart = args.restart !== false;
      return {
        data: { success: true, ...result, restartInitiated: restart },
        restartRequested: restart,
      };
    },
  },
];
