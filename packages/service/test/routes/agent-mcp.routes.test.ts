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
import { handleMcpJsonParseError } from '../../src/agent/mcp/mcp.server.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';
import { FakeAgentApiState } from '../utils/agent-api-state.js';
import type { LogRetentionService } from '../../src/log-retention.service.js';
import type { AgentEvent } from '../../src/agent/agent-events.service.js';

vi.mock('../../src/services/backup.service.js', () => ({
  saveBackup: vi.fn(async () => '/tmp/backups/default.homenet_bridge.yaml.bak'),
}));

const CONFIG_FILE = 'default.homenet_bridge.yaml';
const TOKEN = 'agent-test-token-1234567890';
const AUTH = `Bearer ${TOKEN}`;
const MCP_PATH = '/api/v1/agent/mcp';

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
  automation: [
    {
      id: 'existing_automation',
      name: 'Existing Automation',
      trigger: [{ type: 'state', entity_id: 'existing', match: { eq: 'ON' } }],
      then: [{ action: 'delay', milliseconds: 100 }],
    },
  ],
  scripts: [
    {
      id: 'existing_script',
      description: 'Existing Script',
      actions: [{ action: 'delay', milliseconds: 100 }],
    },
  ],
});

const newSensorDraft = {
  entities: {
    sensor: [
      {
        id: 'mcp_sensor',
        name: 'MCP Sensor',
        state: { index: 1, length: 1, type: 'byte' },
      },
    ],
  },
};

const events: AgentEvent[] = [
  {
    id: 1,
    type: 'state',
    timestamp: '2026-01-01T00:00:00.000Z',
    portId: 'default',
    data: { entityId: 'existing' },
  },
  {
    id: 2,
    type: 'state',
    timestamp: '2026-01-01T00:00:01.000Z',
    portId: 'default',
    data: { entityId: 'existing' },
  },
];

interface TestHarness {
  app: express.Express;
  ctx: AgentRoutesContext;
  bridge: {
    constructCustomPacket: ReturnType<typeof vi.fn>;
    sendRawPacket: ReturnType<typeof vi.fn>;
  };
  rawPacketLogger: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };
}

describe('agent MCP routes', () => {
  let configDir: string;
  let config: HomenetBridgeConfig;
  let harness: TestHarness;

  const buildHarness = (
    options: { allowPacketSend?: boolean; enabled?: boolean } = {},
  ): TestHarness => {
    const enabled = options.enabled ?? true;
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
      listSavedFiles: vi.fn(async () => [
        { filename: 'packet_log.txt', size: 128, createdAt: '2026-01-01T00:00:00.000Z' },
      ]),
      deleteFile: vi.fn(async () => true),
    };

    const ctx: AgentRoutesContext = {
      agentApi: new FakeAgentApiState({
        envEnabled: enabled,
        token: TOKEN,
        allowPacketSend: options.allowPacketSend ?? false,
      }),
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
        getPacketDictionary: () => ({ p1: 'AA55' }),
        getParsedPacketHistoryRaw: () => [
          {
            packetId: 'p1',
            entityId: 'existing',
            state: { state: 'ON' },
            timestamp: '2026-01-01T00:00:01.000Z',
            portId: 'default',
          },
        ],
        getCommandPacketHistoryRaw: () => [],
        getUnmatchedPacketDetails: () => [
          {
            packet: 'CC77',
            portId: 'default',
            count: 2,
            firstSeen: '2026-01-01T00:00:00.000Z',
            lastSeen: '2026-01-01T00:00:03.000Z',
          },
        ],
      } as unknown as LogRetentionService,
      rawPacketLogger: rawPacketLogger as any,
      rawStreamController: {
        acquire: vi.fn(),
        release: vi.fn(),
        getCount: () => 0,
      },
      agentEventHub: {
        getRecent: (count: number) => events.slice(-count),
        getOldestEventId: () => events[0]?.id ?? null,
        replayAfter: (afterId: number) => ({
          events: events.filter((event) => event.id > afterId),
          gap: false,
        }),
        subscribe: () => () => undefined,
      } as any,
      configDir,
      setupWizardService: {} as any,
      setCurrentConfigs: vi.fn(),
      setCurrentRawConfigs: vi.fn(),
      rebuildPortMappings: vi.fn(),
      requestRestart: vi.fn(async () => undefined),
    };

    const app = express();
    app.use(express.json());
    app.use(handleMcpJsonParseError);
    app.use(createAgentRoutes(ctx));

    return { app, ctx, bridge, rawPacketLogger };
  };

  const callMcp = (body: unknown) =>
    request(harness.app)
      .post(MCP_PATH)
      .set('Authorization', AUTH)
      .set('Content-Type', 'application/json')
      .send(body as any);

  const toolCall = (name: string, args: Record<string, unknown> = {}, id = 1) =>
    callMcp({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-mcp-'));
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

  describe('transport', () => {
    it('requires the agent bearer token', async () => {
      const response = await request(harness.app).post(MCP_PATH).send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      });
      expect(response.status).toBe(401);
    });

    it('returns 503 when the agent API is disabled', async () => {
      harness = buildHarness({ enabled: false });
      const response = await callMcp({ jsonrpc: '2.0', id: 1, method: 'initialize' });
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('AGENT_API_DISABLED');
    });

    it('rejects non-JSON content types', async () => {
      const response = await request(harness.app)
        .post(MCP_PATH)
        .set('Authorization', AUTH)
        .set('Content-Type', 'text/plain')
        .send('{"jsonrpc":"2.0","id":1,"method":"ping"}');
      expect(response.status).toBe(415);
      expect(response.body.error).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('returns a JSON-RPC parse error for invalid JSON', async () => {
      const response = await request(harness.app)
        .post(MCP_PATH)
        .set('Authorization', AUTH)
        .set('Content-Type', 'application/json')
        .send('{bad json');
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700 },
      });
    });

    it('rejects GET and DELETE with 405', async () => {
      const get = await request(harness.app).get(MCP_PATH).set('Authorization', AUTH);
      expect(get.status).toBe(405);
      expect(get.headers.allow).toBe('POST');

      const del = await request(harness.app).delete(MCP_PATH).set('Authorization', AUTH);
      expect(del.status).toBe(405);
    });
  });

  describe('initialize', () => {
    it('negotiates a supported protocol version', async () => {
      const response = await callMcp({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {} },
      });
      expect(response.status).toBe(200);
      expect(response.body.result.protocolVersion).toBe('2025-03-26');
      expect(response.body.result.capabilities.tools).toBeDefined();
      expect(response.body.result.serverInfo.name).toBe('homenet2mqtt');
    });

    it('falls back to the latest supported version', async () => {
      const response = await callMcp({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '1999-01-01' },
      });
      expect(response.status).toBe(200);
      expect(response.body.result.protocolVersion).toBe('2025-06-18');
    });

    it('accepts notifications with 202 and no body', async () => {
      const response = await callMcp({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
      expect(response.status).toBe(202);
      expect(response.text).toBe('');
    });

    it('answers ping', async () => {
      const response = await callMcp({ jsonrpc: '2.0', id: 7, method: 'ping' });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
    });
  });

  describe('tools/list', () => {
    it('hides send_packet unless packet sending is enabled', async () => {
      const disabled = await callMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      const disabledNames = disabled.body.result.tools.map((tool: any) => tool.name);
      expect(disabledNames).toContain('list_ports');
      expect(disabledNames).toContain('validate_entity_draft');
      expect(disabledNames).not.toContain('send_packet');

      harness = buildHarness({ allowPacketSend: true });
      const enabled = await callMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      const enabledNames = enabled.body.result.tools.map((tool: any) => tool.name);
      expect(enabledNames).toContain('send_packet');
    });

    it('includes input schemas for every tool', async () => {
      const response = await callMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      for (const tool of response.body.result.tools) {
        expect(tool.inputSchema).toMatchObject({ type: 'object' });
      }
    });
  });

  describe('schema tools', () => {
    it('exposes list_config_schemas and get_config_schema in tools/list', async () => {
      const response = await callMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      const names = response.body.result.tools.map((tool: { name: string }) => tool.name);
      expect(names).toContain('list_config_schemas');
      expect(names).toContain('get_config_schema');
    });

    it('lists bundled schema names', async () => {
      const response = await toolCall('list_config_schemas');
      expect(response.status).toBe(200);
      expect(response.body.result.isError).toBeUndefined();
      expect(response.body.result.structuredContent.schemas).toContain('homenet-bridge');
    });

    it('returns the config schema with entity definitions by default', async () => {
      const response = await toolCall('get_config_schema');
      expect(response.body.result.isError).toBeUndefined();
      const definitions = response.body.result.structuredContent.definitions;
      expect(Object.keys(definitions).length).toBeGreaterThan(40);
      expect(definitions.ClimateEntity.properties.temperature_unit.enum).toEqual(['C', 'F']);
      expect(definitions.StateSchema.properties.data.type).toBe('array');
    });

    it('reports available names when the schema is unknown', async () => {
      const response = await toolCall('get_config_schema', { name: 'homenet' });
      expect(response.body.result.isError).toBe(true);
      expect(response.body.result.structuredContent.error).toBe('SCHEMA_NOT_FOUND');
      expect(response.body.result.structuredContent.details.available).toContain('homenet-bridge');
    });
  });

  describe('observation tools', () => {
    it('lists ports', async () => {
      const response = await toolCall('list_ports');
      expect(response.status).toBe(200);
      expect(response.body.result.isError).toBeUndefined();
      expect(response.body.result.structuredContent.ports[0]).toMatchObject({
        portId: 'default',
        configFile: CONFIG_FILE,
        entityCounts: { sensor: 1 },
      });
    });

    it('lists entities and latest state', async () => {
      const entities = await toolCall('get_entities', { portId: 'default' }, 1);
      expect(entities.body.result.structuredContent.entities[0]).toMatchObject({
        id: 'existing',
        entityType: 'sensor',
      });

      const state = await toolCall('get_entity_state', {}, 2);
      expect(state.body.result.structuredContent.states[0].entityId).toBe('existing');
    });

    it('lists automations and scripts', async () => {
      const automations = await toolCall('get_automations', { portId: 'default' }, 1);
      expect(automations.body.result.structuredContent.automations[0]).toMatchObject({
        id: 'existing_automation',
        name: 'Existing Automation',
        portId: 'default',
      });

      const scripts = await toolCall('get_scripts', { portId: 'default' }, 2);
      expect(scripts.body.result.structuredContent.scripts[0]).toMatchObject({
        id: 'existing_script',
        description: 'Existing Script',
        portId: 'default',
      });
    });

    it('returns packet history and unmatched packets', async () => {
      const history = await toolCall('get_packet_history', { limit: 10 }, 1);
      expect(history.body.result.structuredContent.packets).toHaveLength(1);
      expect(history.body.result.structuredContent.packets[0].type).toBe('parsed');

      const unmatched = await toolCall('get_unmatched_packets', {}, 2);
      expect(unmatched.body.result.structuredContent.packets[0]).toMatchObject({
        packet: 'CC77',
        count: 2,
      });
    });

    it('polls recent events with afterId', async () => {
      const response = await toolCall('get_recent_events', { afterId: 1 }, 1);
      expect(response.body.result.structuredContent.events).toHaveLength(1);
      expect(response.body.result.structuredContent.events[0].id).toBe(2);
      expect(response.body.result.structuredContent.lastEventId).toBe(2);
      expect(response.body.result.structuredContent.gap).toBe(false);
    });

    it('rejects unknown event types', async () => {
      const response = await toolCall('get_recent_events', { types: 'nope' });
      expect(response.body.result.isError).toBe(true);
      expect(response.body.result.structuredContent.error).toBe('INVALID_EVENT_TYPE');
    });
  });

  describe('packet tools', () => {
    it('analyzes a packet against the active config', async () => {
      const response = await toolCall('analyze_packet', { input: 'AA55' });
      expect(response.status).toBe(200);
      expect(response.body.result.structuredContent).toMatchObject({
        source: 'active',
        portId: 'default',
      });
      expect(Array.isArray(response.body.result.structuredContent.packets)).toBe(true);
    });

    it('returns PACKET_SEND_DISABLED when opt-in is off', async () => {
      const response = await toolCall('send_packet', { hex: '0102', confirm: true });
      expect(response.body.result.isError).toBe(true);
      expect(response.body.result.structuredContent.error).toBe('PACKET_SEND_DISABLED');
    });

    it('sends a packet when enabled with confirmation', async () => {
      harness = buildHarness({ allowPacketSend: true });
      const response = await toolCall('send_packet', {
        hex: '0102',
        header: true,
        confirm: true,
      });
      expect(response.body.result.isError).toBeUndefined();
      expect(response.body.result.structuredContent).toMatchObject({
        success: true,
        portId: 'default',
        packet: '0102',
        sentCount: 1,
      });
      expect(harness.bridge.constructCustomPacket).toHaveBeenCalledWith('0102', {
        header: true,
        footer: false,
        checksum: false,
      });
      expect(harness.bridge.sendRawPacket).toHaveBeenCalledWith('default', [1, 2]);
    });
  });

  describe('capture tools', () => {
    it('starts, reads, stops, and lists captures', async () => {
      const start = await toolCall('start_capture', { mode: 'valid' }, 1);
      expect(start.body.result.structuredContent.success).toBe(true);
      expect(harness.rawPacketLogger.start).toHaveBeenCalledWith(expect.anything(), {
        mode: 'valid',
      });

      const status = await toolCall('get_capture_status', {}, 2);
      expect(status.body.result.structuredContent.status).toBeDefined();

      const stop = await toolCall('stop_capture', {}, 3);
      expect(stop.body.result.structuredContent).toMatchObject({
        success: true,
        filename: 'packet_log.txt',
      });

      const files = await toolCall('list_capture_files', {}, 4);
      expect(files.body.result.structuredContent.files).toHaveLength(1);
    });

    it('maps a missing capture to a tool error', async () => {
      harness.rawPacketLogger.stop.mockReturnValueOnce(null);
      const response = await toolCall('stop_capture');
      expect(response.body.result.isError).toBe(true);
      expect(response.body.result.structuredContent.error).toBe('CAPTURE_NOT_RUNNING');
    });
  });

  describe('entity draft tools', () => {
    it('validates a draft and applies it with the returned hash', async () => {
      const validation = await toolCall('validate_entity_draft', {
        discoveryPreview: true,
        ...newSensorDraft,
      });
      const validated = validation.body.result.structuredContent;
      expect(validated.valid).toBe(true);
      expect(validated.draftHash).toMatch(/^sha256:/);
      expect(validated.discovery).toHaveLength(1);

      const apply = await toolCall(
        'apply_entity_draft',
        {
          draftHash: validated.draftHash,
          ...newSensorDraft,
          restart: true,
        },
        2,
      );
      const applied = apply.body.result.structuredContent;
      expect(apply.body.result.isError).toBeUndefined();
      expect(applied).toMatchObject({
        success: true,
        restartRequired: true,
        applied: { entities: ['mcp_sensor'] },
      });
      expect(harness.ctx.setCurrentConfigs).toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(harness.ctx.requestRestart).toHaveBeenCalled();
    });

    it('rejects a stale draft hash', async () => {
      const response = await toolCall('apply_entity_draft', {
        draftHash: 'sha256:stale',
        ...newSensorDraft,
      });
      expect(response.body.result.isError).toBe(true);
      expect(response.body.result.structuredContent.error).toBe('DRAFT_STALE');
    });
  });

  describe('protocol errors', () => {
    it('rejects invalid JSON-RPC requests', async () => {
      const response = await callMcp({ id: 1, method: 'ping' });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(-32600);
    });

    it('returns method not found for unknown methods', async () => {
      const response = await callMcp({ jsonrpc: '2.0', id: 1, method: 'nope' });
      expect(response.status).toBe(200);
      expect(response.body.error.code).toBe(-32601);
    });

    it('returns invalid params for unknown tools and bad arguments', async () => {
      const unknown = await toolCall('nope');
      expect(unknown.body.error.code).toBe(-32602);

      const badArgs = await callMcp({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'list_ports', arguments: [] },
      });
      expect(badArgs.body.error.code).toBe(-32602);
    });

    it('handles JSON-RPC batches and ignores notifications', async () => {
      const response = await callMcp([
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ]);
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({ id: 1, result: {} });
      expect(response.body[1].result.tools.length).toBeGreaterThan(0);
    });

    it('rejects empty batches', async () => {
      const response = await callMcp([]);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(-32600);
    });
  });
});
