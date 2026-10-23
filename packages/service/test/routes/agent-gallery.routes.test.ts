import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import yaml from 'js-yaml';
import { normalizeConfig, logger } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { createAgentRoutes, type AgentRoutesContext } from '../../src/agent/agent.routes.js';
import { RateLimiter } from '../../src/utils/rate-limiter.js';
import { FakeAgentApiState } from '../utils/agent-api-state.js';
import type { LogRetentionService } from '../../src/log-retention.service.js';

const TOKEN = 'agent-test-token-1234567890';
const AUTH = `Bearer ${TOKEN}`;

const HEATERS_YAML = `meta:
  name: 난방
entities:
  climate:
    - $repeat:
        count: heater_count
        as: i
        start: 1
      id: heater_{{i}}
`;

const galleryList = () => ({
  generated_at: '2026-01-01T00:00:00.000Z',
  vendors: [
    {
      id: 'fixturevendor',
      name: 'Fixture Vendor',
      requirements: {
        serial: { baud_rate: 9600, data_bits: 8, parity: 'none', stop_bits: 1 },
        packet_defaults: { rx_header: [] },
      },
      items: [
        {
          file: 'fixturevendor/heaters.yaml',
          name: '난방',
          name_en: 'Heaters',
          version: '2.0.0',
          tags: ['climate'],
          parameters: [{ name: 'heater_count', type: 'integer', default: 4, min: 1, max: 9 }],
          content_summary: { entities: { climate: 4 }, automations: 0, scripts: 0 },
          discovery: {
            match: { data: [130], mask: [254] },
            dimensions: [{ parameter: 'heater_count', index: 2 }],
            inference: { strategy: 'max' },
          },
        },
        {
          file: 'fixturevendor/idle.yaml',
          name_en: 'Idle Device',
          parameters: [],
          content_summary: { entities: { sensor: 1 }, automations: 0, scripts: 0 },
          discovery: { match: { data: [239] }, dimensions: [] },
        },
      ],
    },
    {
      id: 'other',
      name: 'Other Vendor',
      requirements: { serial: { baud_rate: 19200 } },
      items: [
        {
          file: 'other/lights.yaml',
          name_en: 'Lights',
          parameters: [{ name: 'light_count', type: 'integer', default: 1, min: 1, max: 9 }],
          content_summary: { entities: { light: 1 }, automations: 0, scripts: 0 },
          discovery: {
            match: { data: [130], mask: [254] },
            dimensions: [{ parameter: 'light_count', index: 2 }],
            inference: { strategy: 'max' },
          },
        },
      ],
    },
  ],
});

interface GalleryHarnessOptions {
  retentionEnabled?: boolean;
}

const buildHarness = (options: GalleryHarnessOptions = {}) => {
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

  const logRetentionService = {
    isEnabled: () => options.retentionEnabled ?? true,
    getPacketDictionary: () => ({ h3: '828003251e00003c', h4: '828004251e00003d' }),
    getUnmatchedPackets: () => ['b0010300000000b2'],
  } as unknown as LogRetentionService;

  const ctx = {
    agentApi: new FakeAgentApiState({ envEnabled: true, token: TOKEN, allowPacketSend: false }),
    agentRateLimiter: new RateLimiter(60_000, 1000),
    commandRateLimiter: new RateLimiter(60_000, 1000),
    getBridges: () => [],
    getCurrentConfigs: () => [config],
    getCurrentConfigFiles: () => ['default.homenet_bridge.yaml'],
    getCurrentConfigStatuses: () => ['started'],
    getLatestStates: () => new Map(),
    logRetentionService,
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

describe('agent gallery routes', () => {
  const fetchMock = vi.fn();

  const stubRemoteGallery = () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/list_new.json')) {
        return { ok: true, text: async () => JSON.stringify(galleryList()) };
      }
      if (url.endsWith('fixturevendor/heaters.yaml')) {
        return { ok: true, text: async () => HEATERS_YAML };
      }
      return { ok: false, status: 404, text: async () => 'not found' };
    });
    vi.stubGlobal('fetch', fetchMock);
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('list and index', () => {
    it('requires the bearer token', async () => {
      const response = await request(buildHarness()).get('/api/v1/agent/gallery');
      expect(response.status).toBe(401);
    });

    it('lists vendors from GitHub when reachable', async () => {
      stubRemoteGallery();
      const response = await request(buildHarness())
        .get('/api/v1/agent/gallery')
        .set('Authorization', AUTH);

      expect(response.status).toBe(200);
      expect(response.body.source).toBe('remote');
      expect(response.body.vendors.map((vendor: { id: string }) => vendor.id)).toEqual([
        'fixturevendor',
        'other',
      ]);
      expect(response.body.vendors[0]).toMatchObject({
        name: 'Fixture Vendor',
        snippetCount: 2,
        entityTypes: ['climate', 'sensor'],
      });
      expect(fetchMock.mock.calls[0][0]).toContain('raw.githubusercontent.com');
    });

    it('returns the snippet index for one vendor, including discovery blocks', async () => {
      stubRemoteGallery();
      const response = await request(buildHarness())
        .get('/api/v1/agent/gallery?vendor=fixturevendor')
        .set('Authorization', AUTH);

      expect(response.status).toBe(200);
      expect(response.body.vendor).toBe('fixturevendor');
      expect(response.body.snippets).toHaveLength(2);
      expect(response.body.snippets[0]).toMatchObject({
        file: 'fixturevendor/heaters.yaml',
        name_en: 'Heaters',
        parameters: [{ name: 'heater_count', type: 'integer', default: 4, min: 1, max: 9 }],
        discovery: { match: { data: [130], mask: [254] } },
      });
    });

    it('reports available vendor ids when the vendor is unknown', async () => {
      stubRemoteGallery();
      const response = await request(buildHarness())
        .get('/api/v1/agent/gallery?vendor=nope')
        .set('Authorization', AUTH);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('GALLERY_VENDOR_NOT_FOUND');
      expect(response.body.details.available).toEqual(['fixturevendor', 'other']);
    });

    it('falls back to the packaged gallery when GitHub is unreachable', async () => {
      fetchMock.mockImplementation(async () => {
        throw new Error('offline');
      });
      vi.stubGlobal('fetch', fetchMock);

      const response = await request(buildHarness())
        .get('/api/v1/agent/gallery')
        .set('Authorization', AUTH);

      expect(response.status).toBe(200);
      expect(response.body.source).toBe('local');
      expect(response.body.vendors.map((vendor: { id: string }) => vendor.id)).toContain('commax');
    });
  });

  describe('snippet content', () => {
    it('returns raw YAML for a gallery-relative path', async () => {
      stubRemoteGallery();
      const response = await request(buildHarness())
        .get('/api/v1/agent/gallery/snippet?file=fixturevendor/heaters.yaml')
        .set('Authorization', AUTH);

      expect(response.status).toBe(200);
      expect(response.body.source).toBe('remote');
      expect(response.body.bytes).toBe(Buffer.byteLength(HEATERS_YAML, 'utf8'));
      expect(yaml.load(response.body.yaml)).toMatchObject({ meta: { name: '난방' } });
    });

    it('rejects traversal, absolute paths and non-YAML files', async () => {
      stubRemoteGallery();
      const app = buildHarness();
      for (const file of ['../package.json', '/etc/passwd.yaml', 'commax/heaters.json']) {
        const response = await request(app)
          .get('/api/v1/agent/gallery/snippet')
          .query({ file })
          .set('Authorization', AUTH);
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('GALLERY_FILE_INVALID');
      }
    });

    it('requires the file parameter', async () => {
      stubRemoteGallery();
      const response = await request(buildHarness())
        .get('/api/v1/agent/gallery/snippet')
        .set('Authorization', AUTH);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('GALLERY_FILE_INVALID');
    });

    it('returns 404 when neither source has the file', async () => {
      stubRemoteGallery();
      const response = await request(buildHarness())
        .get('/api/v1/agent/gallery/snippet?file=fixturevendor/missing.yaml')
        .set('Authorization', AUTH);
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('GALLERY_FILE_NOT_FOUND');
    });
  });

  describe('match against observed packets', () => {
    it('infers snippet parameters from traffic and skips incompatible vendors', async () => {
      stubRemoteGallery();
      const response = await request(buildHarness())
        .get('/api/v1/agent/gallery/match?portId=default')
        .set('Authorization', AUTH);

      expect(response.status).toBe(200);
      expect(response.body.available).toBe(true);
      expect(response.body.packetCount).toBe(3);
      expect(response.body.evaluatedCount).toBe(2);
      expect(response.body.results).toMatchObject([
        {
          file: 'fixturevendor/heaters.yaml',
          matched: true,
          matchedPacketCount: 2,
          parameterValues: { heater_count: 4 },
        },
        { file: 'fixturevendor/idle.yaml', matched: false },
      ]);
    });

    it('restricts scoring to one vendor when asked', async () => {
      stubRemoteGallery();
      const response = await request(buildHarness())
        .get('/api/v1/agent/gallery/match?vendor=fixturevendor')
        .set('Authorization', AUTH);

      expect(response.status).toBe(200);
      expect(response.body.results.every((r: { vendor: string }) => r.vendor === 'fixturevendor'));
    });

    it('reports unavailable instead of failing when log retention is off', async () => {
      stubRemoteGallery();
      const response = await request(buildHarness({ retentionEnabled: false }))
        .get('/api/v1/agent/gallery/match')
        .set('Authorization', AUTH);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ available: false });
      expect(response.body.reason).toContain('Log retention');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects an unknown port', async () => {
      stubRemoteGallery();
      const response = await request(buildHarness())
        .get('/api/v1/agent/gallery/match?portId=ghost')
        .set('Authorization', AUTH);

      expect(response.status).toBe(404);
      expect(['PORT_NOT_FOUND', 'GALLERY_PORT_NOT_FOUND']).toContain(response.body.error);
    });
  });

  describe('capabilities and MCP', () => {
    it('documents the gallery endpoints', async () => {
      const response = await request(buildHarness()).get('/api/v1/agent/openapi.json');
      expect(response.body.paths['/gallery'].get.parameters).toHaveLength(1);
      expect(response.body.paths['/gallery/snippet'].get.parameters[0].required).toBe(true);
      expect(response.body.paths['/gallery/match'].get).toBeDefined();
      const llms = await request(buildHarness()).get('/api/v1/agent/llms.txt');
      expect(llms.text).toContain('list_gallery');
    });

    it('advertises the gallery feature', async () => {
      const response = await request(buildHarness())
        .get('/api/v1/agent/capabilities')
        .set('Authorization', AUTH);
      expect(response.body.features.gallery).toBe(true);
    });

    it('exposes gallery tools over MCP', async () => {
      stubRemoteGallery();
      const app = buildHarness();

      const list = await request(app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      const names: string[] = list.body.result.tools.map((tool: { name: string }) => tool.name);
      expect(names).toEqual(
        expect.arrayContaining(['list_gallery', 'get_gallery_snippet', 'match_gallery']),
      );

      const call = await request(app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'match_gallery', arguments: { portId: 'default' } },
        });
      expect(call.body.result.structuredContent.results[0]).toMatchObject({
        file: 'fixturevendor/heaters.yaml',
        parameterValues: { heater_count: 4 },
      });

      const missing = await request(app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .send({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'get_gallery_snippet', arguments: {} },
        });
      expect(missing.body.result.isError).toBe(true);
      expect(missing.body.result.content[0].text).toContain('GALLERY_FILE_INVALID');
    });
  });
});
