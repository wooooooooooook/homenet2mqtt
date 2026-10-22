import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { normalizeConfig } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { createAgentRoutes, type AgentRoutesContext } from '../../src/agent/agent.routes.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';
import type { LogRetentionService } from '../../src/log-retention.service.js';

vi.mock('../../src/services/backup.service.js', () => ({
  saveBackup: vi.fn(async () => '/tmp/backups/default.homenet_bridge.yaml.bak'),
}));

const CONFIG_FILE = 'default.homenet_bridge.yaml';
const TOKEN = 'agent-test-token-1234567890';
const AUTH = `Bearer ${TOKEN}`;

const rawConfig = () => ({
  serial: {
    portId: 'default',
    path: '/dev/ttyUSB0',
    baud_rate: 9600,
    data_bits: 8,
    parity: 'none',
    stop_bits: 1,
  },
  sensor: [
    {
      id: 'existing',
      name: 'Existing Sensor',
      state: { index: 0, length: 1, type: 'byte' },
    },
  ],
});

const newSensorDraft = () => ({
  entities: {
    sensor: [
      {
        id: 'new_sensor',
        name: 'New Sensor',
        state: { index: 1, length: 1, type: 'byte' },
      },
    ],
  },
});

interface TestHarness {
  app: express.Express;
  ctx: AgentRoutesContext;
  bridge: {
    constructCustomPacket: ReturnType<typeof vi.fn>;
    sendRawPacket: ReturnType<typeof vi.fn>;
    getPacketIntervalStats: ReturnType<typeof vi.fn>;
    startRawPacketListener: ReturnType<typeof vi.fn>;
    stopRawPacketListener: ReturnType<typeof vi.fn>;
  };
  rawPacketLogger: {
    getStatus: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    getFilePath: ReturnType<typeof vi.fn>;
    listSavedFiles: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
  };
  setCurrentConfigs: ReturnType<typeof vi.fn>;
}

describe('agent routes', () => {
  let configDir: string;
  let config: HomenetBridgeConfig;
  let harness: TestHarness;

  const buildHarness = (
    options: {
      allowPacketSend?: boolean;
      enabled?: boolean;
    } = {},
  ): TestHarness => {
    const bridge = {
      constructCustomPacket: vi.fn((hex: string) => ({ success: true, packet: hex })),
      sendRawPacket: vi.fn(() => true),
      getPacketIntervalStats: vi.fn(() => ({})),
      startRawPacketListener: vi.fn(),
      stopRawPacketListener: vi.fn(),
    };
    const rawPacketLogger = {
      getStatus: vi.fn(() => ({ running: false, mode: null })),
      start: vi.fn(async () => undefined),
      stop: vi.fn(() => ({ filename: 'packet_log.txt', packetCount: 3 })),
      getFilePath: vi.fn(() => null),
      listSavedFiles: vi.fn(async () => []),
      deleteFile: vi.fn(async () => true),
    };
    const setCurrentConfigs = vi.fn();

    const ctx: AgentRoutesContext = {
      agentApiConfig: {
        enabled: options.enabled ?? true,
        token: (options.enabled ?? true) ? TOKEN : null,
        allowPacketSend: options.allowPacketSend ?? false,
        disabledReason: (options.enabled ?? true) ? null : 'missing_token',
      },
      agentRateLimiter: new RateLimiter(60_000, 1000),
      commandRateLimiter: new RateLimiter(60_000, 1000),
      getBridges: () =>
        [
          {
            bridge,
            configFile: CONFIG_FILE,
            resolvedPath: path.join(configDir, CONFIG_FILE),
            config,
          },
        ] as any,
      getCurrentConfigs: () => [config],
      getCurrentConfigFiles: () => [CONFIG_FILE],
      getCurrentConfigStatuses: () => ['started'],
      getLatestStates: () =>
        new Map([
          [
            'default:existing',
            {
              entityId: 'existing',
              topic: 'homenet2mqtt/default/existing/state',
              payload: '{"state":"ON"}',
              state: { state: 'ON' },
              timestamp: '2026-01-01T00:00:00.000Z',
              portId: 'default',
            },
          ],
        ]),
      logRetentionService: {
        getPacketDictionary: () => ({ p1: 'AA55', p2: 'BB66' }),
        getParsedPacketHistoryRaw: () => [
          {
            packetId: 'p1',
            entityId: 'existing',
            state: { state: 'ON' },
            timestamp: '2026-01-01T00:00:01.000Z',
            portId: 'default',
          },
        ],
        getCommandPacketHistoryRaw: () => [
          {
            packetId: 'p2',
            entity: 'existing',
            entityId: 'existing',
            command: 'turn_on',
            value: 'ON',
            timestamp: '2026-01-01T00:00:02.000Z',
            portId: 'default',
          },
        ],
        getUnmatchedPacketDetails: (portId?: string) =>
          [
            {
              packet: 'CC77',
              portId: 'default',
              count: 2,
              firstSeen: '2026-01-01T00:00:00.000Z',
              lastSeen: '2026-01-01T00:00:03.000Z',
            },
          ].filter((entry) => !portId || entry.portId === portId),
      } as unknown as LogRetentionService,
      rawPacketLogger: rawPacketLogger as any,
      rawStreamController: {
        acquire: vi.fn(),
        release: vi.fn(),
        getCount: () => 0,
      },
      agentEventHub: {
        getRecent: () => [],
        getOldestEventId: () => null,
        replayAfter: () => ({ events: [], gap: false }),
        subscribe: () => () => undefined,
      } as any,
      configDir,
      setCurrentConfigs,
      setCurrentRawConfigs: vi.fn(),
      rebuildPortMappings: vi.fn(),
      requestRestart: vi.fn(async () => undefined),
    };

    const app = express();
    app.use(express.json());
    app.use(createAgentRoutes(ctx));

    return {
      app,
      ctx,
      bridge,
      rawPacketLogger,
      setCurrentConfigs,
    };
  };

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-routes-'));
    const raw = rawConfig();
    await fs.writeFile(
      path.join(configDir, CONFIG_FILE),
      yaml.dump({ homenet_bridge: raw }),
      'utf8',
    );
    config = normalizeConfig(raw as unknown as HomenetBridgeConfig);
    harness = buildHarness();
  });

  afterEach(async () => {
    await fs.rm(configDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('public documentation', () => {
    it('serves an OpenAPI 3.1 document without authentication', async () => {
      const response = await request(harness.app).get('/api/v1/agent/openapi.json');
      expect(response.status).toBe(200);
      expect(response.body.openapi).toBe('3.1.0');
      expect(response.body.paths).toHaveProperty('/capabilities');
      expect(response.body.paths).toHaveProperty('/mcp');
    });

    it('serves llms.txt without authentication', async () => {
      const response = await request(harness.app).get('/api/v1/agent/llms.txt');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Authorization');
      expect(response.text).toContain('/api/v1/agent');
      expect(response.text).toContain('MCP');
    });

    it('keeps public docs available when the agent API is disabled', async () => {
      harness = buildHarness({ enabled: false });
      const docs = await request(harness.app).get('/api/v1/agent/openapi.json');
      expect(docs.status).toBe(200);
      const capabilities = await request(harness.app).get('/api/v1/agent/capabilities');
      expect(capabilities.status).toBe(503);
      expect(capabilities.body.error).toBe('AGENT_API_DISABLED');
    });
  });

  describe('authentication', () => {
    it('rejects requests without a token', async () => {
      const response = await request(harness.app).get('/api/v1/agent/capabilities');
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
    });

    it('rejects requests with a wrong token', async () => {
      const response = await request(harness.app)
        .get('/api/v1/agent/capabilities')
        .set('Authorization', `Bearer ${'x'.repeat(32)}`);
      expect(response.status).toBe(401);
    });

    it('returns JSON 404 for unknown agent paths', async () => {
      const response = await request(harness.app)
        .get('/api/v1/agent/unknown')
        .set('Authorization', AUTH);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('observation', () => {
    it('reports capabilities', async () => {
      const response = await request(harness.app)
        .get('/api/v1/agent/capabilities')
        .set('Authorization', AUTH);
      expect(response.status).toBe(200);
      expect(response.body.apiVersion).toBe('v1');
      expect(response.body.features.packetSend).toBe(false);
      expect(response.body.features.mcp).toBe(true);
      expect(response.body.mcp).toMatchObject({
        endpoint: '/api/v1/agent/mcp',
        transport: 'streamable-http',
      });
      expect(response.body.authentication).toBe('bearer');
    });

    it('lists ports with packet defaults and entity counts', async () => {
      const response = await request(harness.app)
        .get('/api/v1/agent/ports')
        .set('Authorization', AUTH);
      expect(response.status).toBe(200);
      expect(response.body.ports).toHaveLength(1);
      expect(response.body.ports[0]).toMatchObject({
        portId: 'default',
        configFile: CONFIG_FILE,
        status: 'started',
        topicPrefix: 'homenet2mqtt/default',
        entityCounts: { sensor: 1 },
      });
    });

    it('lists and finds entities by id', async () => {
      const list = await request(harness.app)
        .get('/api/v1/agent/entities?portId=default')
        .set('Authorization', AUTH);
      expect(list.status).toBe(200);
      expect(list.body.entities).toHaveLength(1);
      expect(list.body.entities[0]).toMatchObject({
        id: 'existing',
        entityType: 'sensor',
        portId: 'default',
      });

      const found = await request(harness.app)
        .get('/api/v1/agent/entities/existing?portId=default')
        .set('Authorization', AUTH);
      expect(found.status).toBe(200);
      expect(found.body.config.id).toBe('existing');

      const missing = await request(harness.app)
        .get('/api/v1/agent/entities/missing?portId=default')
        .set('Authorization', AUTH);
      expect(missing.status).toBe(404);
      expect(missing.body.error).toBe('ENTITY_NOT_FOUND');
    });

    it('rejects an unknown port', async () => {
      const response = await request(harness.app)
        .get('/api/v1/agent/entities?portId=nope')
        .set('Authorization', AUTH);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('PORT_NOT_FOUND');
    });

    it('returns the latest state snapshot', async () => {
      const response = await request(harness.app)
        .get('/api/v1/agent/state?portId=default')
        .set('Authorization', AUTH);
      expect(response.status).toBe(200);
      expect(response.body.states).toEqual([
        expect.objectContaining({ entityId: 'existing', payload: '{"state":"ON"}' }),
      ]);
    });

    it('merges parsed and command packet history in time order', async () => {
      const response = await request(harness.app)
        .get('/api/v1/agent/packets/history?portId=default&limit=10')
        .set('Authorization', AUTH);
      expect(response.status).toBe(200);
      expect(response.body.packets.map((packet: any) => packet.type)).toEqual([
        'parsed',
        'command',
      ]);
      expect(response.body.packets[1].packet).toBe('BB66');
    });

    it('returns unmatched packet details', async () => {
      const response = await request(harness.app)
        .get('/api/v1/agent/packets/unmatched?portId=default')
        .set('Authorization', AUTH);
      expect(response.status).toBe(200);
      expect(response.body.packets[0]).toMatchObject({ packet: 'CC77', count: 2 });
    });
  });

  describe('packet analysis', () => {
    it('analyzes a packet against the active config', async () => {
      const response = await request(harness.app)
        .post('/api/v1/agent/packets/analyze')
        .set('Authorization', AUTH)
        .send({ portId: 'default', input: 'AA55' });
      expect(response.status).toBe(200);
      expect(response.body.source).toBe('active');
      expect(Array.isArray(response.body.packets)).toBe(true);
      expect(response.body.draftValidationErrors).toEqual([]);
    });

    it('analyzes a packet against a merged draft', async () => {
      const response = await request(harness.app)
        .post('/api/v1/agent/packets/analyze')
        .set('Authorization', AUTH)
        .send({ portId: 'default', input: '0102', draft: newSensorDraft() });
      expect(response.status).toBe(200);
      expect(response.body.source).toBe('draft');
      expect(response.body.draftValid).toBe(true);
      expect(response.body.draftApplicable).toBe(true);
      expect(response.body.draftConflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ draftId: 'new_sensor', kind: 'signature' }),
        ]),
      );
    });

    it('rejects invalid packet input', async () => {
      const response = await request(harness.app)
        .post('/api/v1/agent/packets/analyze')
        .set('Authorization', AUTH)
        .send({ portId: 'default', input: 'not-hex' });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('INVALID_PACKET_INPUT');
    });
  });

  describe('packet preview and send', () => {
    it('builds a preview using the bridge packet builder', async () => {
      const response = await request(harness.app)
        .post('/api/v1/agent/packets/preview')
        .set('Authorization', AUTH)
        .send({ portId: 'default', hex: '0102', checksum: true });
      expect(response.status).toBe(200);
      expect(response.body.packet).toBe('0102');
      expect(harness.bridge.constructCustomPacket).toHaveBeenCalledWith('0102', {
        header: false,
        footer: false,
        checksum: true,
      });
    });

    it('blocks sending unless explicitly enabled', async () => {
      const response = await request(harness.app)
        .post('/api/v1/agent/packets/send')
        .set('Authorization', AUTH)
        .send({ portId: 'default', hex: '0102', confirm: true });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('PACKET_SEND_DISABLED');
      expect(harness.bridge.sendRawPacket).not.toHaveBeenCalled();
    });

    it('requires confirm before sending', async () => {
      harness = buildHarness({ allowPacketSend: true });
      const response = await request(harness.app)
        .post('/api/v1/agent/packets/send')
        .set('Authorization', AUTH)
        .send({ portId: 'default', hex: '0102' });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('CONFIRM_REQUIRED');
    });

    it('sends a confirmed packet through the bridge', async () => {
      harness = buildHarness({ allowPacketSend: true });
      const response = await request(harness.app)
        .post('/api/v1/agent/packets/send')
        .set('Authorization', AUTH)
        .send({ portId: 'default', hex: '0102', confirm: true });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        packet: '0102',
        sentCount: 1,
      });
      expect(harness.bridge.sendRawPacket).toHaveBeenCalledWith('default', [1, 2]);
    });

    it('rejects out-of-range send counts', async () => {
      harness = buildHarness({ allowPacketSend: true });
      const response = await request(harness.app)
        .post('/api/v1/agent/packets/send')
        .set('Authorization', AUTH)
        .send({ portId: 'default', hex: '0102', confirm: true, count: 11 });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('INVALID_COUNT');
    });
  });

  describe('capture', () => {
    it('starts capture in the requested mode', async () => {
      const response = await request(harness.app)
        .post('/api/v1/agent/capture/start')
        .set('Authorization', AUTH)
        .send({ mode: 'valid' });
      expect(response.status).toBe(200);
      expect(harness.rawPacketLogger.start).toHaveBeenCalledWith(
        expect.objectContaining({ configFiles: [CONFIG_FILE] }),
        { mode: 'valid' },
      );
      expect(harness.ctx.rawStreamController.acquire).toHaveBeenCalledTimes(1);
    });

    it('does not acquire the raw stream twice when capture is already running', async () => {
      await request(harness.app)
        .post('/api/v1/agent/capture/start')
        .set('Authorization', AUTH)
        .send({ mode: 'all' });
      const response = await request(harness.app)
        .post('/api/v1/agent/capture/start')
        .set('Authorization', AUTH)
        .send({ mode: 'all' });
      expect(response.status).toBe(200);
      expect(harness.ctx.rawStreamController.acquire).toHaveBeenCalledTimes(1);
    });

    it('releases the raw stream listener when capture stops', async () => {
      await request(harness.app)
        .post('/api/v1/agent/capture/start')
        .set('Authorization', AUTH)
        .send({ mode: 'all' });
      const stop = await request(harness.app)
        .post('/api/v1/agent/capture/stop')
        .set('Authorization', AUTH);
      expect(stop.status).toBe(200);
      expect(harness.ctx.rawStreamController.release).toHaveBeenCalledTimes(1);
    });

    it('returns 409 when stopping without a running capture', async () => {
      harness.rawPacketLogger.stop.mockReturnValueOnce(null);
      const response = await request(harness.app)
        .post('/api/v1/agent/capture/stop')
        .set('Authorization', AUTH);
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('CAPTURE_NOT_RUNNING');
    });

    it('returns capture status and stops a running capture', async () => {
      const status = await request(harness.app)
        .get('/api/v1/agent/capture')
        .set('Authorization', AUTH);
      expect(status.status).toBe(200);
      expect(status.body.status).toEqual({ running: false, mode: null });

      const stop = await request(harness.app)
        .post('/api/v1/agent/capture/stop')
        .set('Authorization', AUTH);
      expect(stop.status).toBe(200);
      expect(stop.body).toMatchObject({ success: true, packetCount: 3 });
    });

    it('returns 404 when a capture file is not resolvable', async () => {
      const response = await request(harness.app)
        .get('/api/v1/agent/capture/files/..%2Fsecret.txt')
        .set('Authorization', AUTH);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('CAPTURE_FILE_NOT_FOUND');
    });
  });

  describe('draft validation and apply', () => {
    const validate = (draft: Record<string, unknown>) =>
      request(harness.app)
        .post('/api/v1/agent/entities/validate')
        .set('Authorization', AUTH)
        .send({ portId: 'default', discoveryPreview: true, ...draft });

    it('validates a draft and builds discovery previews', async () => {
      const response = await validate(newSensorDraft());
      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.applicable).toBe(true);
      expect(response.body.discovery).toEqual([
        expect.objectContaining({
          draftId: 'new_sensor',
          entityType: 'sensor',
          topic: expect.stringContaining('homeassistant/sensor/'),
        }),
      ]);
    });

    it('marks exact id conflicts as not applicable', async () => {
      const response = await validate({
        entities: {
          sensor: [
            {
              id: 'existing',
              name: 'Duplicate',
              state: { index: 2, length: 1, type: 'byte' },
            },
          ],
        },
      });
      expect(response.status).toBe(200);
      expect(response.body.applicable).toBe(false);
      expect(response.body.conflicts).toEqual(
        expect.arrayContaining([expect.objectContaining({ draftId: 'existing', kind: 'id' })]),
      );
      expect(response.body.discovery).toEqual([
        expect.objectContaining({
          draftId: 'existing',
          topic: expect.stringContaining('homeassistant/sensor/'),
        }),
      ]);
    });

    it('rejects apply with a stale draft hash', async () => {
      const response = await request(harness.app)
        .post('/api/v1/agent/entities/apply')
        .set('Authorization', AUTH)
        .send({
          portId: 'default',
          draftHash: 'sha256:stale',
          ...newSensorDraft(),
        });
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('DRAFT_STALE');
    });

    it('applies a validated draft, writes the config, and flags restart', async () => {
      const validation = await validate(newSensorDraft());
      const response = await request(harness.app)
        .post('/api/v1/agent/entities/apply')
        .set('Authorization', AUTH)
        .send({
          portId: 'default',
          draftHash: validation.body.draftHash,
          ...newSensorDraft(),
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        restartRequired: true,
        applied: { entities: ['new_sensor'] },
      });
      expect(harness.setCurrentConfigs).toHaveBeenCalledWith(
        0,
        expect.objectContaining({
          sensor: expect.arrayContaining([expect.objectContaining({ id: 'new_sensor' })]),
        }),
      );

      const written = yaml.load(
        await fs.readFile(path.join(configDir, CONFIG_FILE), 'utf8'),
      ) as any;
      expect(written.homenet_bridge.sensor.some((sensor: any) => sensor.id === 'new_sensor')).toBe(
        true,
      );
    });

    it('supports overwrite resolutions for id conflicts', async () => {
      const draft = {
        entities: {
          sensor: [
            {
              id: 'existing',
              name: 'Replaced',
              state: { index: 3, length: 1, type: 'byte' },
            },
          ],
        },
      };
      const validation = await validate(draft);
      expect(validation.body.applicable).toBe(false);

      const response = await request(harness.app)
        .post('/api/v1/agent/entities/apply')
        .set('Authorization', AUTH)
        .send({
          portId: 'default',
          draftHash: validation.body.draftHash,
          resolutions: { existing: 'overwrite' },
          ...draft,
        });

      expect(response.status).toBe(200);
      expect(response.body.applied.entities).toEqual(['existing']);
      expect(harness.setCurrentConfigs).toHaveBeenCalledWith(
        0,
        expect.objectContaining({
          sensor: expect.arrayContaining([
            expect.objectContaining({ id: 'existing', name: 'Replaced' }),
          ]),
        }),
      );
    });
  });
});
