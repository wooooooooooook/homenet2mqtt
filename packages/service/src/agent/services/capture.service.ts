import { logger } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { ConfigItemsError } from '../../services/config-items.service.js';
import type { LogsRoutesContext } from '../../routes/logs.routes.js';
import type { BridgeInstance } from '../../types/index.js';

export interface AgentCaptureContext {
  getCurrentConfigs: () => HomenetBridgeConfig[];
  getCurrentConfigFiles: () => string[];
  getBridges: () => BridgeInstance[];
  rawPacketLogger: LogsRoutesContext['rawPacketLogger'];
  rawStreamController: { acquire: () => void; release: () => void };
}

const captureRawStreams = new WeakMap<object, boolean>();

export interface StartCaptureRequest {
  mode?: unknown;
}

export interface StartCaptureResult {
  success: true;
  status: unknown;
}

export function getAgentCaptureStatus(ctx: AgentCaptureContext): unknown {
  return ctx.rawPacketLogger.getStatus();
}

export async function startAgentCapture(
  ctx: AgentCaptureContext,
  request: StartCaptureRequest = {},
): Promise<StartCaptureResult> {
  const mode = request.mode === 'valid' ? 'valid' : 'all';

  const serial =
    ctx
      .getCurrentConfigs()
      .map((config) => config?.serial)
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .map((value) => ({
        portId: value.portId,
        path: value.path,
        baudRate: value.baud_rate,
      }))[0] ?? null;

  const stats: Record<string, unknown> = {};
  for (const instance of ctx.getBridges()) {
    Object.assign(stats, instance.bridge.getPacketIntervalStats?.() ?? {});
  }

  try {
    await ctx.rawPacketLogger.start(
      { configFiles: ctx.getCurrentConfigFiles(), serial, stats },
      { mode },
    );
  } catch (error) {
    logger.error({ err: error }, '[agent-api] Failed to start capture');
    throw new ConfigItemsError('CAPTURE_START_FAILED', 'Failed to start capture.', 500);
  }

  if (!captureRawStreams.get(ctx.rawPacketLogger)) {
    // Raw packets are only emitted while a raw stream consumer holds the listener.
    ctx.rawStreamController.acquire();
    captureRawStreams.set(ctx.rawPacketLogger, true);
  }

  return { success: true, status: ctx.rawPacketLogger.getStatus() };
}

export function stopAgentCapture(ctx: AgentCaptureContext): Record<string, unknown> {
  const result = ctx.rawPacketLogger.stop();
  if (!result) {
    throw new ConfigItemsError('CAPTURE_NOT_RUNNING', 'No capture is currently running.', 409);
  }

  if (captureRawStreams.get(ctx.rawPacketLogger)) {
    captureRawStreams.delete(ctx.rawPacketLogger);
    ctx.rawStreamController.release();
  }

  return { success: true, ...(result as Record<string, unknown>) };
}

export async function listAgentCaptureFiles(
  ctx: AgentCaptureContext,
): Promise<Array<{ filename: string; size: number; createdAt: string }>> {
  return ctx.rawPacketLogger.listSavedFiles();
}
