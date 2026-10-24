import { deleteAgentBridge } from '../../services/bridges.service.js';
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

export const bridgeTools: McpTool[] = [
  {
    name: 'delete_bridge',
    title: 'Delete a bridge configuration',
    description:
      'Delete a bridge configuration YAML. A backup of the exact current YAML is mandatory: call create_backup first and pass its filename as backupFilename. The call is rejected when that backup no longer matches the current file. Requires confirm=true and restarts the service after responding. When the last configuration is deleted, the setup wizard is reopened.',
    inputSchema: {
      type: 'object',
      required: ['backupFilename', 'confirm'],
      properties: {
        portId: portIdProperty,
        configFile: configFileProperty,
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
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: async (ctx, args) => {
      const result = await deleteAgentBridge(ctx, {
        portId: readStringArg(args, 'portId'),
        configFile: readStringArg(args, 'configFile'),
        backupFilename: args.backupFilename,
        confirm: args.confirm,
      });
      return {
        data: { success: true, ...result, restartInitiated: true },
        restartRequested: true,
      };
    },
  },
];
