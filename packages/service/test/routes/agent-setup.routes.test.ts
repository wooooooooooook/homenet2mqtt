import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { createAgentRoutes, type AgentRoutesContext } from '../../src/agent/agent.routes.js';
import { handleMcpJsonParseError } from '../../src/agent/mcp/mcp.server.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';
import { FakeAgentApiState } from '../utils/agent-api-state.js';
import { createSetupWizardService } from '../../src/services/setup.service.js';
import { fileExists } from '../../src/utils/helpers.js';
import { dumpConfigToYaml } from '../../src/utils/yaml-dumper.js';
import type { LogRetentionService } from '../../src/log-retention.service.js';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';

const TOKEN = 'agent-setup-token-1234567890';
const AUTH = `Bearer ${TOKEN}`;
const CONFIG_FILE = 'default.homenet_bridge.yaml';
const EXAMPLE_FILE = 'test_vendor.homenet_bridge.yaml';

const exampleYaml = `homenet_bridge:
  serial:
    portId: test_port
    path: /dev/ttyS0
    baud_rate: 9600
    data_bits: 8
    parity: none
    stop_bits: 1
  packet_defaults:
    rx_timeout: 10ms
  sensor:
    - id: sensor_a
      name: Sensor A
    - id: sensor_b
      name: Sensor B
`;

interface TestHarness {
  app: express.Express;
  ctx: AgentRoutesContext;
  setLoadedConfigs: (configs: HomenetBridgeConfig[]) => void;
  requestRestart: ReturnType<typeof vi.fn>;
}

describe('agent setup routes', () => {
  let rootDir: string;
  let configDir: string;
  let examplesDir: string;
  let harness: TestHarness;

  const silentLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const buildHarness = (): TestHarness => {
    let loadedConfigs: HomenetBridgeConfig[] = [];
    const requestRestart = vi.fn(async () => undefined);

    const setupWizardService = createSetupWizardService({
      configDir,
      examplesDir,
      defaultConfigFilename: CONFIG_FILE,
      configInitMarker: path.join(configDir, '.initialized'),
      configRestartFlag: path.join(configDir, '.restart-required'),
      envConfigFilesSource: 'default',
      fileExists,
      dumpConfigToYaml,
      saveBackup: vi.fn(async () => path.join(configDir, 'backup.yaml')),
      triggerRestart: vi.fn(async () => undefined),
      serialTestRateLimiter: { check: () => true },
      configRateLimiter: { check: () => true },
      logger: silentLogger,
      getLoadedConfigs: () => loadedConfigs,
    });

    const ctx: AgentRoutesContext = {
      agentApi: new FakeAgentApiState({ envEnabled: true, token: TOKEN }),
      agentRateLimiter: new RateLimiter(60_000, 1000),
      commandRateLimiter: new RateLimiter(60_000, 1000),
      getBridges: () => [],
      getCurrentConfigs: () => loadedConfigs,
      getCurrentConfigFiles: () => (loadedConfigs.length > 0 ? [CONFIG_FILE] : []),
      getCurrentConfigStatuses: () => [],
      getLatestStates: () => new Map(),
      logRetentionService: {} as LogRetentionService,
      rawPacketLogger: {
        getStatus: () => ({ running: false }),
        start: vi.fn(),
        stop: vi.fn(),
        getFilePath: () => null,
        listSavedFiles: vi.fn(async () => []),
        deleteFile: vi.fn(async () => false),
      } as any,
      rawStreamController: {
        acquire: vi.fn(),
        release: vi.fn(),
        getCount: () => 0,
      } as any,
      agentEventHub: {} as any,
      configDir,
      setupWizardService,
      setCurrentConfigs: vi.fn(),
      setCurrentRawConfigs: vi.fn(),
      rebuildPortMappings: vi.fn(),
      requestRestart,
    };

    const app = express();
    app.use(express.json());
    app.use(handleMcpJsonParseError);
    app.use(createAgentRoutes(ctx));

    return {
      app,
      ctx,
      setLoadedConfigs: (configs) => {
        loadedConfigs = configs;
      },
      requestRestart,
    };
  };

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-setup-'));
    configDir = path.join(rootDir, 'config');
    examplesDir = path.join(rootDir, 'examples');
    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(examplesDir, { recursive: true });
    await fs.writeFile(path.join(examplesDir, EXAMPLE_FILE), exampleYaml, 'utf8');
    harness = buildHarness();
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  const post = (url: string, body: Record<string, unknown>) =>
    request(harness.app).post(url).set('Authorization', AUTH).send(body);

  it('reports setup state and examples', async () => {
    const response = await request(harness.app)
      .get('/api/v1/agent/setup')
      .set('Authorization', AUTH);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      setupRequired: true,
      loadedConfigCount: 0,
      loadedPortIds: [],
      requiresInitialization: true,
      defaultConfigName: null,
    });
    expect(response.body.examples).toEqual([EXAMPLE_FILE]);
  });

  it('returns serial defaults and selectable entities for an example', async () => {
    const response = await request(harness.app)
      .get(`/api/v1/agent/setup/examples/${EXAMPLE_FILE}`)
      .set('Authorization', AUTH);

    expect(response.status).toBe(200);
    expect(response.body.filename).toBe(EXAMPLE_FILE);
    expect(response.body.serial).toMatchObject({ portId: 'test_port', baud_rate: 9600 });
    expect(response.body.serial).not.toHaveProperty('path');
    expect(response.body.entities.sensor).toEqual([
      { id: 'sensor_a', name: 'Sensor A' },
      { id: 'sensor_b', name: 'Sensor B' },
    ]);
  });

  it('returns 404 for an unknown example', async () => {
    const response = await request(harness.app)
      .get('/api/v1/agent/setup/examples/missing.yaml')
      .set('Authorization', AUTH);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('EXAMPLE_NOT_FOUND');
  });

  it('rejects serial tests with an invalid path', async () => {
    const response = await post('/api/v1/agent/setup/test-serial', {
      example: EXAMPLE_FILE,
      serialPath: '192.168.0.10',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('SERIAL_TCP_PORT_REQUIRED');
  });

  it('applies an example, filters entities, and writes setup markers', async () => {
    const response = await post('/api/v1/agent/setup/apply', {
      example: EXAMPLE_FILE,
      serialPath: '/dev/ttyUSB0',
      portId: 'test_port',
      selectedEntities: { sensor: ['sensor_a'] },
      restart: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      target: CONFIG_FILE,
      restartScheduled: true,
      restartInitiated: false,
    });

    const written = yaml.load(await fs.readFile(path.join(configDir, CONFIG_FILE), 'utf8')) as any;
    expect(written.homenet_bridge.serial).toMatchObject({
      portId: 'test_port',
      path: '/dev/ttyUSB0',
    });
    expect(written.homenet_bridge.sensor.map((sensor: any) => sensor.id)).toEqual(['sensor_a']);

    expect(await fileExists(path.join(configDir, '.initialized'))).toBe(true);
    expect(await fileExists(path.join(configDir, '.restart-required'))).toBe(true);
    expect(harness.requestRestart).not.toHaveBeenCalled();
  });

  it('restarts after responding when restart is not disabled', async () => {
    const response = await post('/api/v1/agent/setup/apply', {
      example: EXAMPLE_FILE,
      serialPath: '/dev/ttyUSB0',
      restart: true,
    });

    expect(response.status).toBe(200);
    expect(response.body.restartInitiated).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(harness.requestRestart).toHaveBeenCalledTimes(1);
  });

  it('reports loaded port ids and allows serial tests once a configuration is loaded', async () => {
    harness.setLoadedConfigs([{ serial: { portId: 'test_port', path: '/dev/ttyUSB0' } } as any]);

    const state = await request(harness.app).get('/api/v1/agent/setup').set('Authorization', AUTH);
    expect(state.body).toMatchObject({
      setupRequired: false,
      loadedConfigCount: 1,
      loadedPortIds: ['test_port'],
    });

    const test = await post('/api/v1/agent/setup/test-serial', {
      example: EXAMPLE_FILE,
      serialPath: '192.168.0.10',
    });
    expect(test.status).toBe(400);
    expect(test.body.error).toBe('SERIAL_TCP_PORT_REQUIRED');
  });

  it('refuses init mode once a configuration is loaded', async () => {
    harness.setLoadedConfigs([{ serial: { portId: 'test_port', path: '/dev/ttyUSB0' } } as any]);

    const response = await post('/api/v1/agent/setup/apply', {
      example: EXAMPLE_FILE,
      serialPath: '/dev/ttyUSB1',
      portId: 'test_port_2',
      restart: false,
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('SETUP_NOT_REQUIRED');
  });

  it('adds a bridge with mode add and writes a new config file', async () => {
    await fs.writeFile(
      path.join(configDir, CONFIG_FILE),
      yaml.dump({
        homenet_bridge: {
          serial: {
            portId: 'test_port',
            path: '/dev/ttyUSB0',
            baud_rate: 9600,
            data_bits: 8,
            parity: 'none',
            stop_bits: 1,
          },
        },
      }),
      'utf8',
    );
    harness.setLoadedConfigs([{ serial: { portId: 'test_port', path: '/dev/ttyUSB0' } } as any]);

    const response = await post('/api/v1/agent/setup/apply', {
      mode: 'add',
      example: EXAMPLE_FILE,
      serialPath: '/dev/ttyUSB1',
      portId: 'test_port_2',
      selectedEntities: { sensor: ['sensor_a'] },
      restart: false,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      target: 'default_2.homenet_bridge.yaml',
      restartScheduled: true,
      restartInitiated: false,
    });

    const written = yaml.load(
      await fs.readFile(path.join(configDir, 'default_2.homenet_bridge.yaml'), 'utf8'),
    ) as any;
    expect(written.homenet_bridge.serial).toMatchObject({
      portId: 'test_port_2',
      path: '/dev/ttyUSB1',
    });
    expect(written.homenet_bridge.sensor.map((sensor: any) => sensor.id)).toEqual(['sensor_a']);
    expect(await fileExists(path.join(configDir, '.initialized'))).toBe(false);
    expect(await fileExists(path.join(configDir, '.restart-required'))).toBe(true);
  });

  it('rejects duplicate port ids and serial paths in add mode', async () => {
    harness.setLoadedConfigs([{ serial: { portId: 'test_port', path: '/dev/ttyUSB9' } } as any]);

    const duplicatePortId = await post('/api/v1/agent/setup/apply', {
      mode: 'add',
      example: EXAMPLE_FILE,
      serialPath: '/dev/ttyUSB1',
      portId: 'test_port',
      restart: false,
    });
    expect(duplicatePortId.status).toBe(400);
    expect(duplicatePortId.body.error).toBe('PORT_ID_DUPLICATE');

    const duplicateExamplePortId = await post('/api/v1/agent/setup/apply', {
      mode: 'add',
      example: EXAMPLE_FILE,
      serialPath: '/dev/ttyUSB1',
      restart: false,
    });
    expect(duplicateExamplePortId.status).toBe(400);
    expect(duplicateExamplePortId.body.error).toBe('PORT_ID_DUPLICATE');

    const duplicatePath = await post('/api/v1/agent/setup/apply', {
      mode: 'add',
      example: EXAMPLE_FILE,
      serialPath: '/dev/ttyUSB9',
      portId: 'test_port_2',
      restart: false,
    });
    expect(duplicatePath.status).toBe(400);
    expect(duplicatePath.body.error).toBe('SERIAL_PATH_DUPLICATE');

    const duplicateEmptyPortId = await post('/api/v1/agent/setup/apply', {
      mode: 'add',
      example: '__empty__',
      serialConfig: {
        portId: 'test_port',
        path: '/dev/ttyUSB1',
        baud_rate: 9600,
        data_bits: 8,
        parity: 'none',
        stop_bits: 1,
      },
      restart: false,
    });
    expect(duplicateEmptyPortId.status).toBe(400);
    expect(duplicateEmptyPortId.body.error).toBe('PORT_ID_DUPLICATE');
  });

  it('exposes setup tools over MCP and applies with restart', async () => {
    const mcp = (body: unknown) =>
      request(harness.app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .set('Content-Type', 'application/json')
        .send(body as any);

    const tools = await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const names = tools.body.result.tools.map((tool: any) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(['get_setup_state', 'apply_initial_setup', 'test_setup_serial']),
    );

    const state = await mcp({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'get_setup_state', arguments: {} },
    });
    expect(state.body.result.structuredContent.setupRequired).toBe(true);

    const apply = await mcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'apply_initial_setup',
        arguments: {
          example: EXAMPLE_FILE,
          serialPath: '/dev/ttyUSB0',
          restart: true,
        },
      },
    });
    expect(apply.body.result.isError).toBeUndefined();
    expect(apply.body.result.structuredContent).toMatchObject({
      success: true,
      target: CONFIG_FILE,
      restartInitiated: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(harness.requestRestart).toHaveBeenCalledTimes(1);
  });

  it('adds a bridge over MCP with mode add', async () => {
    await fs.writeFile(
      path.join(configDir, CONFIG_FILE),
      yaml.dump({
        homenet_bridge: {
          serial: {
            portId: 'test_port',
            path: '/dev/ttyUSB0',
            baud_rate: 9600,
            data_bits: 8,
            parity: 'none',
            stop_bits: 1,
          },
        },
      }),
      'utf8',
    );
    harness.setLoadedConfigs([{ serial: { portId: 'test_port', path: '/dev/ttyUSB0' } } as any]);

    const response = await request(harness.app)
      .post('/api/v1/agent/mcp')
      .set('Authorization', AUTH)
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'apply_initial_setup',
          arguments: {
            mode: 'add',
            example: EXAMPLE_FILE,
            serialPath: '/dev/ttyUSB1',
            portId: 'mcp_port',
            restart: false,
          },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBeUndefined();
    expect(response.body.result.structuredContent).toMatchObject({
      success: true,
      target: 'default_2.homenet_bridge.yaml',
      restartInitiated: false,
    });
    expect(await fileExists(path.join(configDir, 'default_2.homenet_bridge.yaml'))).toBe(true);
  });
});
