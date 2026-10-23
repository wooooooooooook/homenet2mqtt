import { logger } from '@rs485-homenet/core';
import type { NextFunction, Request, Response } from 'express';
import { ConfigItemsError } from '../../services/config-items.service.js';
import { getAppVersion } from '../../utils/version-utils.js';
import { AGENT_API_BASE, AGENT_PATHS } from '../agent-paths.js';
import type { AgentRoutesContext } from '../agent.routes.js';
import { findMcpTool, listMcpTools } from './tool-registry.js';
import type { McpTool, McpToolOutcome } from './types.js';

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

export type McpProtocolVersion = (typeof MCP_PROTOCOL_VERSIONS)[number];

export const MCP_LATEST_PROTOCOL_VERSION: McpProtocolVersion = '2025-06-18';

const JSON_RPC_VERSION = '2.0';

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const MCP_INSTRUCTIONS = `homenet2mqtt bridges RS485 devices to MQTT / Home Assistant.
If no configuration is loaded yet, call get_setup_state, inspect an example with get_setup_example, test wiring with test_setup_serial, then complete provisioning with apply_initial_setup (mode="init").
To add another bridge while configurations are loaded, call get_setup_state for loadedPortIds, test the new port with test_setup_serial, then call apply_initial_setup with mode="add" and a portId that is not in loadedPortIds.
Use get_entities and get_entity_state to inspect the loaded configuration and live state.
Use get_packet_history and get_unmatched_packets to observe traffic, and analyze_packet to test a packet against the active configuration or an unsaved draft.
Use start_capture / stop_capture / list_capture_files to collect raw bytes.
Register new devices with validate_entity_draft, then apply_entity_draft with the returned draftHash. Applying writes YAML, creates a backup, and requires a restart.
send_packet is only available when AGENT_ALLOW_PACKET_SEND=true and requires confirm=true.`;

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface HandledRequest {
  status: number;
  body: unknown;
  afterResponse?: () => void;
}

export interface McpHttpResult {
  status: number;
  body?: unknown;
  afterResponse?: () => void;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isValidId = (value: unknown): value is JsonRpcId =>
  value === null ||
  typeof value === 'string' ||
  (typeof value === 'number' && Number.isFinite(value));

const isJsonRpcRequest = (value: unknown): value is JsonRpcRequest => {
  if (!isPlainObject(value)) return false;
  if (value.jsonrpc !== JSON_RPC_VERSION) return false;
  return typeof value.method === 'string' && value.method.length > 0;
};

const jsonRpcError = (id: JsonRpcId, code: number, message: string, data?: unknown) => ({
  jsonrpc: JSON_RPC_VERSION,
  id,
  error: {
    code,
    message,
    ...(data === undefined ? {} : { data }),
  },
});

const jsonRpcResult = (id: JsonRpcId, result: unknown) => ({
  jsonrpc: JSON_RPC_VERSION,
  id,
  result,
});

export function handleMcpJsonParseError(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const isMcpPath = req.path === `${AGENT_API_BASE}${AGENT_PATHS.mcp}`;
  const isParseError = isPlainObject(err) && err.type === 'entity.parse.failed';

  if (!isMcpPath || !isParseError) {
    next(err);
    return;
  }

  logger.warn({ err }, '[mcp] Invalid JSON body');
  res.status(400).json(jsonRpcError(null, PARSE_ERROR, 'Invalid JSON body.'));
}

const toWireTool = (tool: McpTool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  ...(tool.annotations ? { annotations: tool.annotations } : {}),
});

const toToolResult = (outcome: McpToolOutcome) => {
  const data = isPlainObject(outcome.data) ? outcome.data : { result: outcome.data };
  return {
    content: [{ type: 'text', text: JSON.stringify(outcome.data, null, 2) }],
    structuredContent: data,
  };
};

const toToolError = (error: string, message: string, details?: unknown) => {
  const payload = {
    error,
    message,
    ...(details === undefined ? {} : { details }),
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true,
  };
};

const negotiateProtocolVersion = (value: unknown): McpProtocolVersion => {
  if (typeof value === 'string' && (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(value)) {
    return value as McpProtocolVersion;
  }
  return MCP_LATEST_PROTOCOL_VERSION;
};

async function handleInitialize(id: JsonRpcId, params: unknown) {
  const request = isPlainObject(params) ? params : {};
  const version = await getAppVersion();

  return {
    status: 200,
    body: jsonRpcResult(id, {
      protocolVersion: negotiateProtocolVersion(request.protocolVersion),
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: 'homenet2mqtt',
        title: 'homenet2mqtt',
        version,
      },
      instructions: MCP_INSTRUCTIONS,
    }),
  };
}

function handleToolsList(ctx: AgentRoutesContext, id: JsonRpcId) {
  return {
    status: 200,
    body: jsonRpcResult(id, {
      tools: listMcpTools({ allowPacketSend: ctx.agentApiConfig.allowPacketSend }).map(toWireTool),
    }),
  };
}

async function handleToolsCall(
  ctx: AgentRoutesContext,
  id: JsonRpcId,
  params: unknown,
): Promise<HandledRequest> {
  if (!isPlainObject(params) || typeof params.name !== 'string' || !params.name.trim()) {
    return {
      status: 200,
      body: jsonRpcError(id, INVALID_PARAMS, 'params.name must be a non-empty string.'),
    };
  }

  const toolName = params.name.trim();
  const tool = findMcpTool(toolName);
  if (!tool) {
    return {
      status: 200,
      body: jsonRpcError(id, INVALID_PARAMS, `Unknown tool "${toolName}".`, {
        available: listMcpTools({ allowPacketSend: ctx.agentApiConfig.allowPacketSend }).map(
          (entry) => entry.name,
        ),
      }),
    };
  }

  let args: Record<string, unknown> = {};
  if (params.arguments !== undefined) {
    if (!isPlainObject(params.arguments)) {
      return {
        status: 200,
        body: jsonRpcError(id, INVALID_PARAMS, 'params.arguments must be an object.'),
      };
    }
    args = params.arguments;
  }

  try {
    const outcome = await tool.handler(ctx, args);
    return {
      status: 200,
      body: jsonRpcResult(id, toToolResult(outcome)),
      afterResponse: outcome.restartRequested
        ? () => {
            void ctx.requestRestart();
          }
        : undefined,
    };
  } catch (error) {
    if (error instanceof ConfigItemsError) {
      return {
        status: 200,
        body: jsonRpcResult(id, toToolError(error.code, error.message, error.details)),
      };
    }
    logger.error({ err: error, tool: toolName }, '[mcp] Tool execution failed');
    return {
      status: 200,
      body: jsonRpcResult(id, toToolError('INTERNAL_ERROR', 'Tool execution failed.')),
    };
  }
}

async function handleRequest(
  ctx: AgentRoutesContext,
  request: JsonRpcRequest,
  id: JsonRpcId,
): Promise<HandledRequest> {
  switch (request.method) {
    case 'initialize':
      return handleInitialize(id, request.params);
    case 'ping':
      return { status: 200, body: jsonRpcResult(id, {}) };
    case 'tools/list':
      return handleToolsList(ctx, id);
    case 'tools/call':
      return handleToolsCall(ctx, id, request.params);
    default:
      return {
        status: 200,
        body: jsonRpcError(id, METHOD_NOT_FOUND, `Method not found: ${request.method}`),
      };
  }
}

async function handleSingle(
  ctx: AgentRoutesContext,
  payload: unknown,
): Promise<HandledRequest | null> {
  if (!isJsonRpcRequest(payload)) {
    return {
      status: 400,
      body: jsonRpcError(null, INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request.'),
    };
  }

  const hasId = Object.prototype.hasOwnProperty.call(payload, 'id');
  if (hasId && !isValidId(payload.id)) {
    return {
      status: 400,
      body: jsonRpcError(null, INVALID_REQUEST, 'JSON-RPC id must be a string, number, or null.'),
    };
  }
  if (!hasId) {
    // Notifications (e.g. notifications/initialized) never receive a response body.
    return null;
  }

  const id = payload.id ?? null;

  try {
    return await handleRequest(ctx, payload, id);
  } catch (error) {
    logger.error({ err: error, method: payload.method }, '[mcp] Request handling failed');
    return {
      status: 200,
      body: jsonRpcError(id, INTERNAL_ERROR, 'Internal error while handling the request.'),
    };
  }
}

export async function handleMcpPayload(
  ctx: AgentRoutesContext,
  payload: unknown,
): Promise<McpHttpResult> {
  if (payload === undefined) {
    return {
      status: 400,
      body: jsonRpcError(null, PARSE_ERROR, 'Request body is required.'),
    };
  }

  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return {
        status: 400,
        body: jsonRpcError(null, INVALID_REQUEST, 'JSON-RPC batch must not be empty.'),
      };
    }

    const responses: unknown[] = [];
    let afterResponse: (() => void) | undefined;

    for (const message of payload) {
      const handled = await handleSingle(ctx, message);
      if (!handled) continue;
      responses.push(handled.body);
      if (handled.afterResponse) {
        afterResponse = handled.afterResponse;
      }
    }

    if (responses.length === 0) {
      return { status: 202, afterResponse };
    }
    return { status: 200, body: responses, afterResponse };
  }

  const handled = await handleSingle(ctx, payload);
  if (!handled) {
    return { status: 202 };
  }
  return { status: handled.status, body: handled.body, afterResponse: handled.afterResponse };
}
