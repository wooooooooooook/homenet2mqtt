import { ConfigItemsError } from '../../../services/config-items.service.js';
import {
  applyAgentInitialSetup,
  getAgentSetupExample,
  getAgentSetupState,
  testAgentSetupSerial,
} from '../../services/setup.service.js';
import type { McpTool } from '../types.js';
import { readStringArg } from './args.js';

const exampleProperty = {
  type: 'string',
  description: 'Example filename from get_setup_state, or "__empty__" for a blank configuration.',
};

export const setupTools: McpTool[] = [
  {
    name: 'get_setup_state',
    title: 'Get initial setup state',
    description:
      'Check whether the service is waiting for initial configuration, list bundled example configurations, and report loadedPortIds that are already in use. setupRequired is true only while no configuration is loaded.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (ctx) => ({ data: await getAgentSetupState(ctx) }),
  },
  {
    name: 'get_setup_example',
    title: 'Inspect a setup example',
    description:
      'Return the serial defaults, packet defaults, and selectable entity ids for a bundled example configuration.',
    inputSchema: {
      type: 'object',
      required: ['example'],
      properties: { example: exampleProperty },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (ctx, args) => {
      const example = readStringArg(args, 'example');
      if (!example) {
        throw new ConfigItemsError(
          'EXAMPLE_REQUIRED',
          'example must be an example filename or "__empty__".',
          400,
        );
      }
      return { data: await getAgentSetupExample(ctx, example) };
    },
  },
  {
    name: 'test_setup_serial',
    title: 'Test a serial port during setup',
    description:
      'Open the serial port briefly and collect up to 10 raw packets. Available during initial setup and when adding another bridge, as long as the port is not already held by a running bridge.',
    inputSchema: {
      type: 'object',
      required: ['example'],
      properties: {
        example: exampleProperty,
        serialPath: {
          type: 'string',
          description: 'Device path or host:port. Required for example configurations.',
        },
        portId: { type: 'string' },
        serialConfig: {
          type: 'object',
          additionalProperties: true,
          description: 'Full serial settings for "__empty__".',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: async (ctx, args) => ({ data: await testAgentSetupSerial(ctx, args) }),
  },
  {
    name: 'apply_initial_setup',
    title: 'Apply initial setup or add a bridge',
    description:
      'With mode="init" (default), seed the default configuration from an example or "__empty__" and mark initialization complete; this requires that no configuration is loaded. With mode="add", write a new configuration file to add another bridge while configurations are loaded; portId and serialPath must not duplicate an existing port. Restarts after responding unless restart=false.',
    inputSchema: {
      type: 'object',
      required: ['example'],
      properties: {
        example: exampleProperty,
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
          description: 'Entity ids to keep, keyed by entity type.',
        },
        restart: {
          type: 'boolean',
          default: true,
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
      const result = await applyAgentInitialSetup(ctx, args);
      const restart = args.restart !== false;
      return {
        data: { success: true, ...result, restartInitiated: restart },
        restartRequested: restart,
      };
    },
  },
];
