import type { McpTool } from './types.js';
import { captureTools } from './tools/capture.tools.js';
import { entityTools } from './tools/entity.tools.js';
import { eventTools } from './tools/event.tools.js';
import { observationTools } from './tools/observation.tools.js';
import { packetTools } from './tools/packet.tools.js';
import { setupTools } from './tools/setup.tools.js';

export const MCP_TOOLS: McpTool[] = [
  ...setupTools,
  ...observationTools,
  ...packetTools,
  ...captureTools,
  ...entityTools,
  ...eventTools,
];

export function findMcpTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}

export function listMcpTools(options: { allowPacketSend: boolean }): McpTool[] {
  return MCP_TOOLS.filter((tool) => !tool.requiresPacketSend || options.allowPacketSend);
}
