import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { normalizeConfig } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { createAgentRoutes, type AgentRoutesContext } from '../../src/agent/agent.routes.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';
import { FakeAgentApiState } from '../utils/agent-api-state.js';
import type { LogRetentionService } from '../../src/log-retention.service.js';

const TOKEN = 'agent-test-token-1234567890';
const AUTH = `Bearer ${TOKEN}`;

const buildHarness = () => {
  const config = normalizeConfig({
    serial: {
      portId: 'default',
      path: '/dev/ttyUSB0',
      baud_rate: 9600,
      data_bits: 8,
      parity: 'none',
      stop_bits: 1,
    },
    sensor: [{ id: 'existing', name: 'Existing', state: { index: 0, length: 1, type: 'byte' } }],
  } as unknown as HomenetBridgeConfig);

  const ctx = {
    agentApi: new FakeAgentApiState({ envEnabled: true, token: TOKEN, allowPacketSend: false }),
    agentRateLimiter: new RateLimiter(60_000, 1000),
    commandRateLimiter: new RateLimiter(60_000, 1000),
    getBridges: () => [],
    getCurrentConfigs: () => [config],
    getCurrentConfigFiles: () => ['default.homenet_bridge.yaml'],
    getCurrentConfigStatuses: () => ['started'],
    getLatestStates: () => new Map(),
    logRetentionService: { isEnabled: () => true } as unknown as LogRetentionService,
    rawPacketLogger: { getFilePath: () => null, listSavedFiles: async () => [] },
    rawStreamController: { acquire: vi.fn(), release: vi.fn(), getCount: () => 0 },
    agentEventHub: { getRecent: () => [], getOldestEventId: () => null, subscribe: () => () => {} },
    configDir: '/tmp',
    setupWizardService: {},
    setCurrentConfigs: vi.fn(),
    setCurrentRawConfigs: vi.fn(),
    rebuildPortMappings: vi.fn(),
    requestRestart: vi.fn(async () => undefined),
  } as unknown as AgentRoutesContext;

  const app = express();
  app.use(express.json());
  app.use(createAgentRoutes(ctx));
  return app;
};

describe('agent schema routes', () => {
  it('requires the bearer token', async () => {
    const response = await request(buildHarness()).get('/api/v1/agent/schema');
    expect(response.status).toBe(401);
  });

  it('lists the bundled schemas', async () => {
    const response = await request(buildHarness())
      .get('/api/v1/agent/schema')
      .set('Authorization', AUTH);

    expect(response.status).toBe(200);
    expect(response.body.schemas).toContain('homenet-bridge');
  });

  it('serves the config schema with entity definitions', async () => {
    const response = await request(buildHarness())
      .get('/api/v1/agent/schema/homenet-bridge')
      .set('Authorization', AUTH);

    expect(response.status).toBe(200);
    const { definitions } = response.body;
    expect(Object.keys(definitions).length).toBeGreaterThan(40);
    expect(definitions.ClimateEntity.properties).toMatchObject({
      state: { $ref: '#/definitions/StateSchema' },
      state_temperature_target: { anyOf: expect.any(Array) },
    });
    expect(definitions.ClimateEntity.properties.temperature_unit.enum).toEqual(['C', 'F']);
    expect(definitions.PacketDefaults.properties.rx_length.type).toBe('number');
  });

  it('rejects a schema name outside the allowed pattern', async () => {
    const response = await request(buildHarness())
      .get('/api/v1/agent/schema/Bad_Name')
      .set('Authorization', AUTH);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('SCHEMA_NAME_INVALID');
  });

  it('rejects path traversal attempts', async () => {
    const response = await request(buildHarness())
      .get('/api/v1/agent/schema/..%2F..%2Fpackage')
      .set('Authorization', AUTH);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('SCHEMA_NAME_INVALID');
  });

  it('reports available schemas when the name is unknown', async () => {
    const response = await request(buildHarness())
      .get('/api/v1/agent/schema/homenet')
      .set('Authorization', AUTH);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('SCHEMA_NOT_FOUND');
    expect(response.body.details.available).toContain('homenet-bridge');
  });

  it('documents the schema paths in the OpenAPI document', async () => {
    const response = await request(buildHarness()).get('/api/v1/agent/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.paths['/schema'].get.tags).toEqual(['schema']);
    expect(response.body.paths['/schema/{schemaName}'].get.parameters[0].name).toBe('schemaName');
    // Regression guard: the MCP path must keep its metadata next to the schema paths.
    expect(response.body.paths['/mcp'].post.tags).toEqual(['mcp']);
    expect(response.body.tags.map((tag: { name: string }) => tag.name)).toContain('schema');
  });

  it('advertises the schema feature and link in capabilities', async () => {
    const response = await request(buildHarness())
      .get('/api/v1/agent/capabilities')
      .set('Authorization', AUTH);

    expect(response.status).toBe(200);
    expect(response.body.features.schema).toBe(true);
    expect(response.body.links.schema).toBe('/api/v1/agent/schema');
  });
});
