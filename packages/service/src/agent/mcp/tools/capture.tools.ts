import {
  getAgentCaptureStatus,
  listAgentCaptureFiles,
  startAgentCapture,
  stopAgentCapture,
} from '../../services/capture.service.js';
import type { McpTool } from '../types.js';

export const captureTools: McpTool[] = [
  {
    name: 'start_capture',
    title: 'Start raw packet capture',
    description:
      'Start recording raw RS485 bytes to a capture file. mode "all" records every chunk, "valid" records only complete valid packets.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['all', 'valid'], default: 'all' },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: async (ctx, args) => ({
      data: await startAgentCapture(ctx, { mode: args.mode }),
    }),
  },
  {
    name: 'stop_capture',
    title: 'Stop raw packet capture',
    description:
      'Stop the active raw packet capture and return the saved file name and packet count.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: (ctx) => ({ data: stopAgentCapture(ctx) }),
  },
  {
    name: 'get_capture_status',
    title: 'Get capture status',
    description: 'Return whether a raw packet capture is running and its current mode.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (ctx) => ({ data: { status: getAgentCaptureStatus(ctx) } }),
  },
  {
    name: 'list_capture_files',
    title: 'List capture files',
    description: 'List saved raw packet capture files with size and creation time.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async (ctx) => ({ data: { files: await listAgentCaptureFiles(ctx) } }),
  },
];
