/**
 * Agent API v1 - versioned REST surface for AI agents.
 * Public docs stay open; every other endpoint requires a Bearer token.
 */

import fs from 'node:fs/promises';
import { Router } from 'express';
import type { RequestHandler, Response } from 'express';
import { logger } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import type { RateLimiter } from '../utils/rate-limiter.js';
import type { ConfigStatus, BridgeInstance, StateChangeEvent } from '../types/index.js';
import type { LogRetentionService } from '../log-retention.service.js';
import type { LogsRoutesContext } from '../routes/logs.routes.js';
import { getAppVersion } from '../utils/version-utils.js';
import { ConfigItemsError } from '../services/config-items.service.js';
import { AGENT_API_BASE, AGENT_PATHS } from './agent-paths.js';
import type { AgentApiState } from './agent-api.store.js';
import { createAgentAuthMiddleware } from './agent-auth.middleware.js';
import { AGENT_LLMS_TXT, buildOpenApiDocument } from './openapi.js';
import type { AgentEvent, AgentEventHub, AgentEventType } from './agent-events.service.js';
import { AGENT_EVENT_TYPES } from './agent-events.service.js';
import type { RawStreamController } from './raw-stream.controller.js';
import { handleMcpPayload, MCP_PROTOCOL_VERSIONS } from './mcp/mcp.server.js';
import {
  AGENT_PACKET_HISTORY_DEFAULT_LIMIT,
  AGENT_PACKET_HISTORY_MAX_LIMIT,
  findAgentAutomation,
  findAgentEntity,
  findAgentScript,
  listAgentAutomations,
  listAgentEntities,
  listAgentPacketHistory,
  listAgentPorts,
  listAgentScripts,
  listAgentStates,
  listAgentUnmatchedPackets,
} from './services/observation.service.js';
import {
  getAgentCaptureStatus,
  listAgentCaptureFiles,
  startAgentCapture,
  stopAgentCapture,
} from './services/capture.service.js';
import {
  AGENT_PACKET_SEND_MAX_COUNT,
  analyzeAgentPacket,
  previewAgentPacket,
  sendAgentPacket,
} from './services/packet.service.js';
import { applyAgentEntityDraft, validateAgentEntityDraft } from './services/entities.service.js';
import {
  createAgentBackup,
  getAgentBackup,
  listAgentBackups,
  restoreAgentBackup,
} from './services/backups.service.js';
import { isPlainObject, readDraftInput, readOptionalString, toInteger } from './services/input.js';
import { isAgentPortError, resolveAgentPort } from './services/port.service.js';
import {
  expandGallerySnippet,
  getGallerySnippet,
  getGalleryVendorIndex,
  listGalleryVendors,
  matchGallerySnippets,
} from './services/gallery.service.js';
import {
  applyAgentInitialSetup,
  getAgentSetupExample,
  getAgentSetupState,
  testAgentSetupSerial,
} from './services/setup.service.js';
import { listAgentSchemas, readAgentSchema } from './services/schema.service.js';
import type { SetupWizardService } from '../services/setup.service.js';

export const MAX_AGENT_EVENT_STREAMS = 8;

const DEFAULT_EVENT_TYPES: AgentEventType[] = [
  'state',
  'parsed-packet',
  'unmatched-packet',
  'command-packet',
  'bridge-status',
];

const EVENT_HEARTBEAT_MS = 15_000;

export interface AgentRoutesContext {
  agentApi: AgentApiState;
  agentRateLimiter: RateLimiter;
  commandRateLimiter: RateLimiter;
  getBridges: () => BridgeInstance[];
  getCurrentConfigs: () => HomenetBridgeConfig[];
  getCurrentConfigFiles: () => string[];
  getCurrentConfigStatuses: () => ConfigStatus[];
  getLatestStates: () => Map<string, StateChangeEvent>;
  logRetentionService: LogRetentionService;
  rawPacketLogger: LogsRoutesContext['rawPacketLogger'];
  rawStreamController: RawStreamController;
  agentEventHub: AgentEventHub;
  configDir: string;
  setupWizardService: SetupWizardService;
  setCurrentConfigs: (index: number, config: HomenetBridgeConfig) => void;
  setCurrentRawConfigs: (index: number, config: HomenetBridgeConfig) => void;
  rebuildPortMappings: () => void;
  requestRestart: () => Promise<void>;
}

const sendError = (
  res: Response,
  status: number,
  error: string,
  message?: string,
  details?: unknown,
): void => {
  const body: Record<string, unknown> = { error };
  if (message) body.message = message;
  if (details !== undefined) body.details = details;
  res.status(status).json(body);
};

const handleRouteError = (res: Response, error: unknown): void => {
  if (error instanceof ConfigItemsError) {
    sendError(res, error.status, error.code, error.message, error.details);
    return;
  }
  logger.error({ err: error }, '[agent-api] Request failed');
  sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error while handling the request.');
};

const firstQueryValue = (value: unknown): string | undefined =>
  readOptionalString(Array.isArray(value) ? value[0] : value);

const resolvePort = (ctx: AgentRoutesContext, portIdInput: unknown) =>
  resolveAgentPort(
    { configs: ctx.getCurrentConfigs(), configFiles: ctx.getCurrentConfigFiles() },
    portIdInput,
  );

const resolvePortOrRespond = (ctx: AgentRoutesContext, res: Response, portIdInput: unknown) => {
  const resolved = resolvePort(ctx, portIdInput);
  if (isAgentPortError(resolved)) {
    sendError(res, resolved.status, resolved.code, resolved.message);
    return null;
  }
  return resolved;
};

export function createAgentRoutes(ctx: AgentRoutesContext): Router {
  const router = Router();
  const authMiddleware = createAgentAuthMiddleware(ctx.agentApi);
  let activeEventStreams = 0;

  const rateLimitMiddleware: RequestHandler = (_req, res, next) => {
    // Behind HA ingress all requests share one IP, so use a fixed bucket.
    if (!ctx.agentRateLimiter.check('agent')) {
      sendError(res, 429, 'RATE_LIMITED', 'Agent API rate limit exceeded.');
      return;
    }
    next();
  };

  // --- Public docs ---
  router.get(`${AGENT_API_BASE}${AGENT_PATHS.openapi}`, async (_req, res) => {
    try {
      const version = await getAppVersion();
      res.json(buildOpenApiDocument({ version }));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.llms}`, (_req, res) => {
    res.type('text/plain; charset=utf-8').send(AGENT_LLMS_TXT);
  });

  router.use(AGENT_API_BASE, rateLimitMiddleware, authMiddleware);

  // --- Meta ---
  router.get(`${AGENT_API_BASE}${AGENT_PATHS.capabilities}`, async (_req, res) => {
    try {
      const version = await getAppVersion();
      res.json({
        api: 'homenet2mqtt-agent',
        apiVersion: 'v1',
        serviceVersion: version,
        authentication: 'bearer',
        features: {
          observation: true,
          packetAnalysis: true,
          packetPreview: true,
          packetSend: ctx.agentApi.getAllowPacketSend(),
          capture: true,
          events: true,
          draftEntities: true,
          setup: true,
          gallery: true,
          schema: true,
          backups: true,
          mcp: true,
        },
        limits: {
          requestsPerMinute: 120,
          packetHistoryLimit: AGENT_PACKET_HISTORY_MAX_LIMIT,
          eventBuffer: 500,
          eventStreams: MAX_AGENT_EVENT_STREAMS,
          packetSendCount: AGENT_PACKET_SEND_MAX_COUNT,
        },
        mcp: {
          enabled: true,
          endpoint: `${AGENT_API_BASE}${AGENT_PATHS.mcp}`,
          transport: 'streamable-http',
          protocolVersions: MCP_PROTOCOL_VERSIONS,
        },
        links: {
          openapi: `${AGENT_API_BASE}${AGENT_PATHS.openapi}`,
          llms: `${AGENT_API_BASE}${AGENT_PATHS.llms}`,
          schema: `${AGENT_API_BASE}${AGENT_PATHS.schema}`,
          mcp: `${AGENT_API_BASE}${AGENT_PATHS.mcp}`,
        },
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  // --- Initial setup ---
  router.get(`${AGENT_API_BASE}${AGENT_PATHS.setup}`, async (_req, res) => {
    try {
      res.json(await getAgentSetupState(ctx));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.setupExample}`, async (req, res) => {
    try {
      res.json(await getAgentSetupExample(ctx, req.params.filename));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post(`${AGENT_API_BASE}${AGENT_PATHS.setupTestSerial}`, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    try {
      res.json(await testAgentSetupSerial(ctx, body));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post(`${AGENT_API_BASE}${AGENT_PATHS.setupApply}`, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    try {
      const result = await applyAgentInitialSetup(ctx, body);
      const restartInitiated = body.restart !== false;

      if (restartInitiated) {
        res.on('finish', () => {
          void ctx.requestRestart();
        });
      }

      res.json({ success: true, ...result, restartInitiated });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  // --- Observation ---
  router.get(`${AGENT_API_BASE}${AGENT_PATHS.ports}`, (_req, res) => {
    const ports = listAgentPorts({
      configs: ctx.getCurrentConfigs(),
      configFiles: ctx.getCurrentConfigFiles(),
      statuses: ctx.getCurrentConfigStatuses(),
    });
    res.json({ ports });
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.entities}`, (req, res) => {
    const portId = firstQueryValue(req.query.portId);
    if (portId) {
      const port = resolvePortOrRespond(ctx, res, portId);
      if (!port) return;
    }
    res.json({
      portId: portId ?? null,
      entities: listAgentEntities(ctx.getCurrentConfigs(), portId),
    });
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.entity}`, (req, res) => {
    const portId = firstQueryValue(req.query.portId);
    if (portId) {
      const port = resolvePortOrRespond(ctx, res, portId);
      if (!port) return;
    }

    const entity = findAgentEntity(ctx.getCurrentConfigs(), req.params.entityId, portId);
    if (!entity) {
      return sendError(
        res,
        404,
        'ENTITY_NOT_FOUND',
        `Entity "${req.params.entityId}" was not found.`,
      );
    }
    res.json(entity);
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.automations}`, (req, res) => {
    const portId = firstQueryValue(req.query.portId);
    if (portId) {
      const port = resolvePortOrRespond(ctx, res, portId);
      if (!port) return;
    }
    res.json({
      portId: portId ?? null,
      automations: listAgentAutomations(ctx.getCurrentConfigs(), portId),
    });
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.automation}`, (req, res) => {
    const portId = firstQueryValue(req.query.portId);
    if (portId) {
      const port = resolvePortOrRespond(ctx, res, portId);
      if (!port) return;
    }

    const automation = findAgentAutomation(
      ctx.getCurrentConfigs(),
      req.params.automationId,
      portId,
    );
    if (!automation) {
      return sendError(
        res,
        404,
        'AUTOMATION_NOT_FOUND',
        `Automation "${req.params.automationId}" was not found.`,
      );
    }
    res.json(automation);
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.scripts}`, (req, res) => {
    const portId = firstQueryValue(req.query.portId);
    if (portId) {
      const port = resolvePortOrRespond(ctx, res, portId);
      if (!port) return;
    }
    res.json({
      portId: portId ?? null,
      scripts: listAgentScripts(ctx.getCurrentConfigs(), portId),
    });
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.script}`, (req, res) => {
    const portId = firstQueryValue(req.query.portId);
    if (portId) {
      const port = resolvePortOrRespond(ctx, res, portId);
      if (!port) return;
    }

    const script = findAgentScript(ctx.getCurrentConfigs(), req.params.scriptId, portId);
    if (!script) {
      return sendError(
        res,
        404,
        'SCRIPT_NOT_FOUND',
        `Script "${req.params.scriptId}" was not found.`,
      );
    }
    res.json(script);
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.state}`, (req, res) => {
    const portId = firstQueryValue(req.query.portId);
    if (portId) {
      const port = resolvePortOrRespond(ctx, res, portId);
      if (!port) return;
    }
    res.json({
      portId: portId ?? null,
      states: listAgentStates(ctx.getLatestStates(), portId),
    });
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.packetHistory}`, (req, res) => {
    const portId = firstQueryValue(req.query.portId);
    if (portId) {
      const port = resolvePortOrRespond(ctx, res, portId);
      if (!port) return;
    }

    const requestedLimit = toInteger(req.query.limit, AGENT_PACKET_HISTORY_DEFAULT_LIMIT);
    const limit = Math.min(Math.max(requestedLimit, 1), AGENT_PACKET_HISTORY_MAX_LIMIT);
    const since = firstQueryValue(req.query.since);

    const packets = listAgentPacketHistory(ctx.logRetentionService, { portId, limit, since });
    res.json({ portId: portId ?? null, count: packets.length, packets });
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.packetUnmatched}`, (req, res) => {
    const portId = firstQueryValue(req.query.portId);
    if (portId) {
      const port = resolvePortOrRespond(ctx, res, portId);
      if (!port) return;
    }
    const packets = listAgentUnmatchedPackets(ctx.logRetentionService, portId);
    res.json({ portId: portId ?? null, count: packets.length, packets });
  });

  // --- Packet analysis ---
  router.post(`${AGENT_API_BASE}${AGENT_PATHS.packetAnalyze}`, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    try {
      const result = await analyzeAgentPacket(ctx, {
        portId: body.portId,
        input: body.input,
        draft: body.draft,
        similarityThreshold: body.similarityThreshold,
      });
      res.json(result);
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  // --- Packet preview / send ---
  router.post(`${AGENT_API_BASE}${AGENT_PATHS.packetPreview}`, (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    try {
      res.json(
        previewAgentPacket(ctx, {
          portId: body.portId,
          hex: body.hex,
          header: body.header,
          footer: body.footer,
          checksum: body.checksum,
        }),
      );
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post(`${AGENT_API_BASE}${AGENT_PATHS.packetSend}`, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    try {
      const result = await sendAgentPacket(ctx, {
        portId: body.portId,
        hex: body.hex,
        confirm: body.confirm,
        count: body.count,
        interval: body.interval,
        header: body.header,
        footer: body.footer,
        checksum: body.checksum,
      });
      res.json(result);
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  // --- Raw capture ---
  router.get(`${AGENT_API_BASE}${AGENT_PATHS.capture}`, (_req, res) => {
    res.json({ status: getAgentCaptureStatus(ctx) });
  });

  router.post(`${AGENT_API_BASE}${AGENT_PATHS.captureStart}`, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    try {
      res.json(await startAgentCapture(ctx, { mode: body.mode }));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post(`${AGENT_API_BASE}${AGENT_PATHS.captureStop}`, (_req, res) => {
    try {
      res.json(stopAgentCapture(ctx));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.captureFiles}`, async (_req, res) => {
    try {
      const files = await listAgentCaptureFiles(ctx);
      res.json({ files });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.captureFile}`, async (req, res) => {
    const filename = req.params.filename;
    const filePath = ctx.rawPacketLogger.getFilePath(filename);
    if (!filePath) {
      return sendError(res, 404, 'CAPTURE_FILE_NOT_FOUND', 'Capture file not found.');
    }

    try {
      await fs.access(filePath);
    } catch {
      return sendError(res, 404, 'CAPTURE_FILE_NOT_FOUND', 'Capture file not found.');
    }

    res.download(filePath, filename, (error) => {
      if (!error) return;
      if (!res.headersSent) {
        sendError(res, 500, 'CAPTURE_FILE_DOWNLOAD_FAILED', 'Failed to download capture file.');
        return;
      }
      logger.warn({ err: error, filename }, '[agent-api] Failed to download capture file');
    });
  });

  router.delete(`${AGENT_API_BASE}${AGENT_PATHS.captureFile}`, async (req, res) => {
    const deleted = await ctx.rawPacketLogger.deleteFile(req.params.filename);
    if (!deleted) {
      return sendError(res, 404, 'CAPTURE_FILE_NOT_FOUND', 'Capture file not found.');
    }
    res.json({ success: true, filename: req.params.filename });
  });

  // --- Gallery (vendor entity presets, GitHub-first with packaged fallback) ---
  router.get(`${AGENT_API_BASE}${AGENT_PATHS.gallery}`, async (req, res) => {
    const vendor = firstQueryValue(req.query.vendor);
    try {
      res.json(vendor ? await getGalleryVendorIndex(vendor) : await listGalleryVendors());
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.gallerySnippet}`, async (req, res) => {
    const file = firstQueryValue(req.query.file);
    try {
      if (!file) {
        return sendError(
          res,
          400,
          'GALLERY_FILE_INVALID',
          'file must be a gallery-relative YAML path such as "commax/heaters_new.yaml".',
        );
      }
      res.json(await getGallerySnippet(file));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.galleryMatch}`, async (req, res) => {
    const portId = firstQueryValue(req.query.portId);
    if (portId) {
      const port = resolvePortOrRespond(ctx, res, portId);
      if (!port) return;
    }
    try {
      res.json(
        await matchGallerySnippets(ctx, {
          portId,
          vendor: firstQueryValue(req.query.vendor),
        }),
      );
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post(`${AGENT_API_BASE}${AGENT_PATHS.galleryExpand}`, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    if (body.portId !== undefined && body.portId !== null && body.portId !== '') {
      const port = resolvePortOrRespond(ctx, res, body.portId);
      if (!port) return;
    }
    try {
      res.json(
        await expandGallerySnippet({
          file: typeof body.file === 'string' ? body.file : '',
          parameterValues: body.parameterValues as Record<string, unknown> | undefined,
        }),
      );
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  // --- Configuration backups (config YAML snapshot, download, restore) ---
  router.get(`${AGENT_API_BASE}${AGENT_PATHS.backups}`, async (req, res) => {
    try {
      res.json(
        await listAgentBackups(ctx, {
          portId: firstQueryValue(req.query.portId),
          configFile: firstQueryValue(req.query.configFile),
        }),
      );
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post(`${AGENT_API_BASE}${AGENT_PATHS.backups}`, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    try {
      const backup = await createAgentBackup(ctx, body);
      res.json({ created: true, backup });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post(`${AGENT_API_BASE}${AGENT_PATHS.backupRestore}`, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    try {
      const result = await restoreAgentBackup(ctx, body);
      const restartInitiated = body.restart !== false;

      if (restartInitiated) {
        res.on('finish', () => {
          void ctx.requestRestart();
        });
      }

      res.json({ success: true, ...result, restartInitiated });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.backup}`, async (req, res) => {
    try {
      const backup = await getAgentBackup(ctx, req.params.filename);
      const raw = firstQueryValue(req.query.raw);
      if (raw === 'true' || raw === '1') {
        res.attachment(backup.filename);
        res.type('text/yaml');
        res.send(backup.yaml);
        return;
      }
      res.json(backup);
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  // --- Bundled configuration schemas (field names, enums, required flags) ---
  router.get(`${AGENT_API_BASE}${AGENT_PATHS.schema}`, async (_req, res) => {
    try {
      res.json(await listAgentSchemas());
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.get(`${AGENT_API_BASE}${AGENT_PATHS.schemaFile}`, async (req, res) => {
    try {
      res.json(await readAgentSchema(req.params.schemaName));
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  // --- Server-Sent Events ---
  router.get(`${AGENT_API_BASE}${AGENT_PATHS.events}`, (req, res) => {
    if (activeEventStreams >= MAX_AGENT_EVENT_STREAMS) {
      return sendError(
        res,
        429,
        'TOO_MANY_EVENT_STREAMS',
        `At most ${MAX_AGENT_EVENT_STREAMS} event streams may be open at once.`,
      );
    }

    const rawTypes = firstQueryValue(req.query.types);
    let types: Set<AgentEventType>;
    if (rawTypes) {
      const requested = rawTypes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const invalid = requested.filter(
        (value) => !AGENT_EVENT_TYPES.includes(value as AgentEventType),
      );
      if (invalid.length > 0) {
        return sendError(
          res,
          400,
          'INVALID_EVENT_TYPE',
          `Unknown event type(s): ${invalid.join(', ')}.`,
          {
            allowed: AGENT_EVENT_TYPES,
          },
        );
      }
      types = new Set(requested as AgentEventType[]);
    } else {
      types = new Set(DEFAULT_EVENT_TYPES);
    }

    const rawQuery = firstQueryValue(req.query.raw);
    if (rawQuery === 'all' || rawQuery === 'valid') {
      types.add('raw');
    }

    const wantsRaw = types.has('raw');
    const rawMode: 'all' | 'valid' | undefined = wantsRaw
      ? rawQuery === 'valid'
        ? 'valid'
        : 'all'
      : undefined;
    const portId = firstQueryValue(req.query.portId);
    const filter = { types, portId, rawMode };

    activeEventStreams += 1;
    let cleanedUp = false;
    let heartbeat: NodeJS.Timeout | null = null;
    let unsubscribe = (): void => {};
    let rawAcquired = false;

    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
      if (rawAcquired) {
        ctx.rawStreamController.release();
        rawAcquired = false;
      }
      activeEventStreams = Math.max(0, activeEventStreams - 1);
    };

    const safeWrite = (chunk: string): void => {
      if (cleanedUp) return;
      try {
        res.write(chunk);
      } catch (error) {
        logger.debug({ err: error }, '[agent-api] SSE write failed');
        cleanup();
      }
    };

    const writeEvent = (id: number | null, event: string, data: unknown): void => {
      const lines: string[] = [];
      if (id !== null) lines.push(`id: ${id}`);
      lines.push(`event: ${event}`);
      lines.push(`data: ${JSON.stringify(data)}`);
      safeWrite(`${lines.join('\n')}\n\n`);
    };

    if (wantsRaw) {
      ctx.rawStreamController.acquire();
      rawAcquired = true;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    const recent = ctx.agentEventHub.getRecent(1, {});
    const snapshot = {
      ports: listAgentPorts({
        configs: ctx.getCurrentConfigs(),
        configFiles: ctx.getCurrentConfigFiles(),
        statuses: ctx.getCurrentConfigStatuses(),
      }).filter((port) => !portId || port.portId === portId),
      states: listAgentStates(ctx.getLatestStates(), portId),
      capture: ctx.rawPacketLogger.getStatus(),
      filters: { types: [...types], portId: portId ?? null, rawMode: rawMode ?? null },
      lastEventId: recent.length > 0 ? recent[recent.length - 1].id : null,
      oldestEventId: ctx.agentEventHub.getOldestEventId(),
    };
    writeEvent(null, 'snapshot', snapshot);

    const lastEventIdHeader = req.headers['last-event-id'];
    const headerValue = Array.isArray(lastEventIdHeader) ? lastEventIdHeader[0] : lastEventIdHeader;
    const sinceId = toInteger(firstQueryValue(req.query.sinceId) ?? headerValue, 0);
    if (sinceId > 0) {
      const replay = ctx.agentEventHub.replayAfter(sinceId, filter);
      if (replay.gap) {
        writeEvent(null, 'gap', {
          requestedSince: sinceId,
          oldestAvailable: ctx.agentEventHub.getOldestEventId(),
        });
      }
      for (const event of replay.events) {
        writeEvent(event.id, event.type, event);
      }
    }

    unsubscribe = ctx.agentEventHub.subscribe(filter, (event: AgentEvent) => {
      writeEvent(event.id, event.type, event);
    });

    heartbeat = setInterval(() => {
      safeWrite(': ping\n\n');
    }, EVENT_HEARTBEAT_MS);
    heartbeat.unref?.();
  });

  // --- Draft validation / apply ---
  router.post(`${AGENT_API_BASE}${AGENT_PATHS.entitiesValidate}`, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    try {
      const result = await validateAgentEntityDraft(ctx, {
        portId: body.portId,
        draft: readDraftInput(body),
        similarityThreshold: body.similarityThreshold,
        discoveryPreview: body.discoveryPreview,
      });
      res.json({ ...result.validation, portId: result.portId, discovery: result.discovery });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.post(`${AGENT_API_BASE}${AGENT_PATHS.entitiesApply}`, async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    try {
      const result = await applyAgentEntityDraft(ctx, {
        portId: body.portId,
        draft: readDraftInput(body),
        draftHash: body.draftHash,
        resolutions: body.resolutions,
        renames: body.renames,
      });

      if (body.restart === true) {
        res.on('finish', () => {
          void ctx.requestRestart();
        });
      }

      res.json({
        success: true,
        portId: result.portId,
        backup: result.backup,
        applied: result.applied,
        draftHash: result.draftHash,
        restartRequired: true,
      });
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  // --- MCP (Streamable HTTP, stateless JSON-RPC 2.0) ---
  router.post(`${AGENT_API_BASE}${AGENT_PATHS.mcp}`, async (req, res) => {
    if (!req.is('application/json')) {
      return sendError(
        res,
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'MCP requests must use Content-Type: application/json.',
      );
    }

    try {
      const result = await handleMcpPayload(ctx, req.body);
      if (result.afterResponse) {
        res.on('finish', result.afterResponse);
      }
      if (result.body === undefined) {
        res.status(result.status).end();
        return;
      }
      res.status(result.status).json(result.body);
    } catch (error) {
      handleRouteError(res, error);
    }
  });

  router.all(`${AGENT_API_BASE}${AGENT_PATHS.mcp}`, (_req, res) => {
    res.setHeader('Allow', 'POST');
    sendError(
      res,
      405,
      'METHOD_NOT_ALLOWED',
      'The MCP endpoint only accepts POST JSON-RPC requests.',
    );
  });

  // Authenticated but unknown agent paths must not fall through to the SPA.
  router.use(AGENT_API_BASE, (req, res) => {
    sendError(res, 404, 'NOT_FOUND', `No agent API route for ${req.method} ${req.originalUrl}.`);
  });

  return router;
}
