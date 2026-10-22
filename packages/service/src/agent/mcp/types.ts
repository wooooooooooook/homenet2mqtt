import type { AgentRoutesContext } from '../agent.routes.js';

export interface McpToolOutcome {
  data: unknown;
  restartRequested?: boolean;
}

export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
  requiresPacketSend?: boolean;
  handler: (
    ctx: AgentRoutesContext,
    args: Record<string, unknown>,
  ) => McpToolOutcome | Promise<McpToolOutcome>;
}
