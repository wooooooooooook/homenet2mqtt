/**
 * Packet tools routes - packet preview and send endpoints
 */

import { Router } from 'express';
import { logger } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { analyzePacketChunk } from '@rs485-homenet/core/utils/packet-analysis';
import { RateLimiter } from '../utils/rate-limiter.js';
import { findBridgeInstanceByPortId, findConfigByPortId } from '../utils/bridge-lookup.js';
import { parsePacketInput } from '../utils/packet-input.js';
import type { BridgeInstance } from '../types/index.js';
import type { LogRetentionService } from '../log-retention.service.js';

export interface PacketToolsRoutesContext {
  commandRateLimiter: RateLimiter;
  getBridges: () => BridgeInstance[];
  getCurrentConfigs: () => HomenetBridgeConfig[];
  logRetentionService: LogRetentionService;
}

export function createPacketToolsRoutes(ctx: PacketToolsRoutesContext): Router {
  const router = Router();

  // Packet dictionary
  router.get('/api/packets/dictionary', (_req, res) => {
    res.json(ctx.logRetentionService.getPacketDictionary());
  });

  // Command packet history
  router.get('/api/packets/command/history', (_req, res) => {
    res.json({
      dictionary: ctx.logRetentionService.getPacketDictionary(),
      logs: ctx.logRetentionService.getCommandPacketHistoryRaw(),
    });
  });

  // Parsed packet history
  router.get('/api/packets/parsed/history', (_req, res) => {
    res.json({
      dictionary: ctx.logRetentionService.getPacketDictionary(),
      logs: ctx.logRetentionService.getParsedPacketHistoryRaw(),
    });
  });

  // Unmatched (valid but unparsed) packets
  router.get('/api/packets/unmatched', (_req, res) => {
    res.json({
      packets: ctx.logRetentionService.getUnmatchedPackets(),
    });
  });

  // Full dictionary view (dictionary + unmatched packets + stats + parsed entities)
  router.get('/api/packets/dictionary/full', (req, res) => {
    const portId = typeof req.query.portId === 'string' ? req.query.portId : undefined;
    res.json({
      dictionary: ctx.logRetentionService.getPacketDictionary(portId),
      unmatchedPackets: ctx.logRetentionService.getUnmatchedPackets(portId),
      parsedPacketEntities: ctx.logRetentionService.getParsedPacketEntities(portId),
      stats: ctx.logRetentionService.getStats(),
    });
  });

  // Packet preview (construct without sending)
  router.post('/api/tools/packet/preview', async (req, res) => {
    if (!ctx.commandRateLimiter.check(req.ip || 'unknown')) {
      logger.warn({ ip: req.ip }, '[service] Packet preview rate limit exceeded');
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { hex, header, footer, checksum, portId } = req.body;

    if (!hex) return res.status(400).json({ error: 'hex is required' });

    const instance = findBridgeInstanceByPortId(ctx.getBridges(), portId);
    if (!instance) return res.status(404).json({ error: 'Bridge not found' });

    const result = instance.bridge.constructCustomPacket(hex, { header, footer, checksum });
    if (!result.success) return res.status(400).json({ error: result.error });

    res.json({ preview: result.packet });
  });

  // Packet send
  router.post('/api/tools/packet/send', async (req, res) => {
    if (!ctx.commandRateLimiter.check(req.ip || 'unknown')) {
      logger.warn({ ip: req.ip }, '[service] Packet send rate limit exceeded');
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { hex, header, footer, checksum, portId, interval = 100, count = 1 } = req.body;

    if (!hex) return res.status(400).json({ error: 'hex is required' });

    const instance = findBridgeInstanceByPortId(ctx.getBridges(), portId);
    if (!instance) return res.status(404).json({ error: 'Bridge not found' });

    const result = instance.bridge.constructCustomPacket(hex, { header, footer, checksum });
    if (!result.success || !result.packet) return res.status(400).json({ error: result.error });

    const packetBytes = result.packet.match(/.{1,2}/g)?.map((x: string) => parseInt(x, 16));

    if (!packetBytes) {
      return res.status(400).json({ error: 'Failed to generate packet bytes from hex' });
    }

    const maxCount = 50; // Safety limit
    const effectiveCount = Math.min(count, maxCount);
    let sentCount = 0;

    try {
      for (let i = 0; i < effectiveCount; i++) {
        instance.bridge.sendRawPacket(portId, packetBytes);
        sentCount++;
        if (i < effectiveCount - 1) {
          await new Promise((r) => setTimeout(r, interval));
        }
      }
      res.json({ success: true, sentCount });
    } catch (error) {
      logger.error({ err: error, portId }, '[service] Failed to send custom packet');
      res.status(500).json({ error: 'Failed to send packet' });
    }
  });

  // Packet analyze
  router.post('/api/tools/packet/analyze', (req, res) => {
    if (!ctx.commandRateLimiter.check(req.ip || 'unknown')) {
      logger.warn({ ip: req.ip }, '[service] Packet analyze rate limit exceeded');
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { input, portId } = req.body ?? {};
    const parsed = parsePacketInput(input);
    if ('error' in parsed) {
      return res.status(400).json({ error: parsed.error });
    }

    const config = findConfigByPortId(ctx.getCurrentConfigs(), portId);
    if (!config) {
      return res.status(404).json({ error: 'Bridge config not found' });
    }

    try {
      const result = analyzePacketChunk(config, Buffer.from(parsed.bytes));
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, '[service] Packet analyze failed');
      res.status(500).json({ error: 'Packet analyze failed' });
    }
  });

  return router;
}
