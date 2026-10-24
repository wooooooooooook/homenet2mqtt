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
import { FakeAgentApiState } from '../utils/agent-api-state.js';
import type { LogRetentionService } from '../../src/log-retention.service.js';

const CONFIG_FILE = 'default.homenet_bridge.yaml';
const TOKEN = 'agent-test-token-1234567890';
const AUTH = `Bearer ${TOKEN}`;

const buildRawConfig = () => ({
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

interface BackupHarness {
  app: express.Express;
  ctx: AgentRoutesContext;
  configDir: string;
  setCurrentConfigs: ReturnType<typeof vi.fn>;
  setCurrentRawConfigs: ReturnType<typeof vi.fn>;
  removeCurrentConfig: ReturnType<typeof vi.fn>;
  rebuildPortMappings: ReturnType<typeof vi.fn>;
  requestRestart: ReturnType<typeof vi.fn>;
}

describe('agent configuration backups', () => {
  let configDir: string;
  let config: HomenetBridgeConfig;
  let harness: BackupHarness;

  const configPath = () => path.join(configDir, CONFIG_FILE);
  const backupPath = (filename: string) => path.join(configDir, 'backups', filename);

  const buildHarness = (): BackupHarness => {
    const setCurrentConfigs = vi.fn();
    const setCurrentRawConfigs = vi.fn();
    const removeCurrentConfig = vi.fn();
    const rebuildPortMappings = vi.fn();
    const requestRestart = vi.fn(async () => undefined);

    const ctx = {
      agentApi: new FakeAgentApiState({ envEnabled: true, token: TOKEN, allowPacketSend: false }),
      agentRateLimiter: new RateLimiter(60_000, 1000),
      commandRateLimiter: new RateLimiter(60_000, 1000),
      getBridges: () => [],
      getCurrentConfigs: () => [config],
      getCurrentConfigFiles: () => [CONFIG_FILE],
      getCurrentConfigStatuses: () => ['started'],
      getLatestStates: () => new Map(),
      logRetentionService: {} as unknown as LogRetentionService,
      rawPacketLogger: { getFilePath: () => null, listSavedFiles: async () => [] },
      rawStreamController: { acquire: vi.fn(), release: vi.fn(), getCount: () => 0 },
      agentEventHub: {
        getRecent: () => [],
        getOldestEventId: () => null,
        subscribe: () => () => {},
      },
      configDir,
      configInitMarker: path.join(configDir, '.initialized'),
      setupWizardService: {},
      setCurrentConfigs,
      setCurrentRawConfigs,
      removeCurrentConfig,
      rebuildPortMappings,
      requestRestart,
    } as unknown as AgentRoutesContext;

    const app = express();
    app.use(express.json());
    app.use(createAgentRoutes(ctx));

    return {
      app,
      ctx,
      configDir,
      setCurrentConfigs,
      setCurrentRawConfigs,
      removeCurrentConfig,
      rebuildPortMappings,
      requestRestart,
    };
  };

  const createBackup = async (reason?: string) => {
    const response = await request(harness.app)
      .post('/api/v1/agent/backups')
      .set('Authorization', AUTH)
      .send(reason === undefined ? {} : { reason });
    expect(response.status).toBe(200);
    return response.body.backup as {
      filename: string;
      configFile: string;
      reason: string;
      bytes: number;
      yaml: string;
    };
  };

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-backups-'));
    const raw = buildRawConfig();
    await fs.writeFile(configPath(), yaml.dump({ homenet_bridge: raw }), 'utf8');
    config = normalizeConfig(raw as unknown as HomenetBridgeConfig);
    harness = buildHarness();
  });

  afterEach(async () => {
    await fs.rm(configDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('requires the bearer token', async () => {
    const response = await request(harness.app).get('/api/v1/agent/backups');
    expect(response.status).toBe(401);
  });

  it('creates a snapshot of the current YAML and lists it', async () => {
    const backup = await createBackup('before_edit');

    expect(backup).toMatchObject({
      configFile: CONFIG_FILE,
      reason: 'before_edit',
    });
    expect(backup.bytes).toBeGreaterThan(0);
    expect(yaml.load(backup.yaml)).toMatchObject({
      homenet_bridge: { serial: { portId: 'default' } },
    });
    await expect(fs.access(backupPath(backup.filename))).resolves.toBeUndefined();
    await expect(fs.readFile(backupPath(backup.filename), 'utf8')).resolves.toBe(backup.yaml);

    const list = await request(harness.app)
      .get('/api/v1/agent/backups')
      .query({ configFile: CONFIG_FILE })
      .set('Authorization', AUTH);

    expect(list.status).toBe(200);
    expect(list.body.configFile).toBe(CONFIG_FILE);
    expect(list.body.backups).toHaveLength(1);
    expect(list.body.backups[0]).toMatchObject({
      filename: backup.filename,
      configFile: CONFIG_FILE,
      reason: 'before_edit',
      size: backup.bytes,
    });
    expect(list.body.totalSize).toBe(backup.bytes);
  });

  it('returns backup metadata/YAML and supports raw downloads', async () => {
    const backup = await createBackup();

    const metadata = await request(harness.app)
      .get(`/api/v1/agent/backups/${backup.filename}`)
      .set('Authorization', AUTH);

    expect(metadata.status).toBe(200);
    expect(metadata.body).toMatchObject({
      filename: backup.filename,
      configFile: CONFIG_FILE,
      reason: 'agent_backup',
      bytes: backup.bytes,
    });
    expect(metadata.body.yaml).toBe(backup.yaml);

    const raw = await request(harness.app)
      .get(`/api/v1/agent/backups/${backup.filename}`)
      .query({ raw: 'true' })
      .set('Authorization', AUTH);

    expect(raw.status).toBe(200);
    expect(raw.headers['content-type']).toContain('text/yaml');
    expect(raw.headers['content-disposition']).toContain('attachment');
    expect(raw.text).toBe(backup.yaml);
  });

  it('rejects invalid backup names, missing files and unknown ports', async () => {
    const invalid = [
      'not-a-backup.txt',
      encodeURIComponent('../escape.yaml.2026-01-01T00-00-00-000Z.agent_backup.bak'),
      encodeURIComponent('/tmp/absolute.yaml.2026-01-01T00-00-00-000Z.agent_backup.bak'),
    ];
    for (const filename of invalid) {
      const response = await request(harness.app)
        .get(`/api/v1/agent/backups/${filename}`)
        .set('Authorization', AUTH);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('BACKUP_FILENAME_INVALID');
    }

    const missing = await request(harness.app)
      .get(
        '/api/v1/agent/backups/default.homenet_bridge.yaml.2026-01-01T00-00-00-000Z.agent_backup.bak',
      )
      .set('Authorization', AUTH);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('BACKUP_NOT_FOUND');

    const unknownPort = await request(harness.app)
      .post('/api/v1/agent/backups')
      .set('Authorization', AUTH)
      .send({ portId: 'ghost' });
    expect(unknownPort.status).toBe(404);
    expect(unknownPort.body.error).toBe('PORT_NOT_FOUND');

    const badReason = await request(harness.app)
      .post('/api/v1/agent/backups')
      .set('Authorization', AUTH)
      .send({ reason: 'bad/reason' });
    expect(badReason.status).toBe(400);
    expect(badReason.body.error).toBe('BACKUP_REASON_INVALID');
  });

  it('requires confirmation before restoring and writes a pre_restore backup', async () => {
    const backup = await createBackup('before_restore_test');

    const changedYaml = yaml.dump({
      homenet_bridge: {
        ...buildRawConfig(),
        sensor: [{ id: 'existing', name: 'Changed', state: { index: 0, length: 1, type: 'byte' } }],
      },
    });
    await fs.writeFile(configPath(), changedYaml, 'utf8');

    const denied = await request(harness.app)
      .post('/api/v1/agent/backups/restore')
      .set('Authorization', AUTH)
      .send({ filename: backup.filename });
    expect(denied.status).toBe(400);
    expect(denied.body.error).toBe('BACKUP_CONFIRM_REQUIRED');
    await expect(fs.readFile(configPath(), 'utf8')).resolves.toBe(changedYaml);

    const restored = await request(harness.app)
      .post('/api/v1/agent/backups/restore')
      .set('Authorization', AUTH)
      .send({ filename: backup.filename, confirm: true });

    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({
      success: true,
      restoredFrom: backup.filename,
      configFile: CONFIG_FILE,
      loaded: true,
      restartRequired: true,
      restartInitiated: true,
    });
    expect(restored.body.previousBackup).toMatch(/\.pre_restore\.bak$/);

    await expect(fs.readFile(configPath(), 'utf8')).resolves.toBe(backup.yaml);
    await expect(fs.readFile(backupPath(restored.body.previousBackup), 'utf8')).resolves.toBe(
      changedYaml,
    );

    expect(harness.setCurrentConfigs).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        sensor: [expect.objectContaining({ id: 'existing', name: 'Existing Sensor' })],
      }),
    );
    expect(harness.setCurrentRawConfigs).toHaveBeenCalledTimes(1);
    expect(harness.rebuildPortMappings).toHaveBeenCalledTimes(1);
    expect(harness.requestRestart).toHaveBeenCalledTimes(1);
  });

  it('can restore without restarting', async () => {
    const backup = await createBackup();

    const restored = await request(harness.app)
      .post('/api/v1/agent/backups/restore')
      .set('Authorization', AUTH)
      .send({ filename: backup.filename, confirm: true, restart: false });

    expect(restored.status).toBe(200);
    expect(restored.body.restartInitiated).toBe(false);
    expect(harness.requestRestart).not.toHaveBeenCalled();
  });

  it('rejects a backup that is not a homenet_bridge config', async () => {
    const filename = `${CONFIG_FILE}.2026-01-01T00-00-00-000Z.manual.bak`;
    await fs.mkdir(path.join(configDir, 'backups'), { recursive: true });
    await fs.writeFile(backupPath(filename), 'not: [valid', 'utf8');

    const malformed = await request(harness.app)
      .post('/api/v1/agent/backups/restore')
      .set('Authorization', AUTH)
      .send({ filename, confirm: true });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe('BACKUP_INVALID');

    await fs.writeFile(backupPath(filename), yaml.dump({ other: true }), 'utf8');
    const wrongRoot = await request(harness.app)
      .post('/api/v1/agent/backups/restore')
      .set('Authorization', AUTH)
      .send({ filename, confirm: true });
    expect(wrongRoot.status).toBe(400);
    expect(wrongRoot.body.error).toBe('BACKUP_INVALID');
  });

  describe('bridge deletion', () => {
    const deleteBridge = (body: Record<string, unknown>) =>
      request(harness.app)
        .post('/api/v1/agent/bridges/delete')
        .set('Authorization', AUTH)
        .send(body);

    it('requires confirmation before deleting', async () => {
      const backup = await createBackup('before_delete');

      const denied = await deleteBridge({ backupFilename: backup.filename });
      expect(denied.status).toBe(400);
      expect(denied.body.error).toBe('BRIDGE_DELETE_CONFIRM_REQUIRED');
      await expect(fs.access(configPath())).resolves.toBeUndefined();
      expect(harness.requestRestart).not.toHaveBeenCalled();
    });

    it('requires a backup filename', async () => {
      const denied = await deleteBridge({ confirm: true });
      expect(denied.status).toBe(400);
      expect(denied.body.error).toBe('BACKUP_REQUIRED');
      await expect(fs.access(configPath())).resolves.toBeUndefined();
    });

    it('rejects a stale backup when the YAML changed after the snapshot', async () => {
      const backup = await createBackup('before_delete');
      const current = await fs.readFile(configPath(), 'utf8');
      await fs.writeFile(configPath(), `${current}\n# edited after backup\n`, 'utf8');

      const denied = await deleteBridge({
        backupFilename: backup.filename,
        confirm: true,
      });
      expect(denied.status).toBe(409);
      expect(denied.body.error).toBe('BACKUP_STALE');
      await expect(fs.access(configPath())).resolves.toBeUndefined();
    });

    it('rejects a backup that belongs to another config file', async () => {
      const current = await fs.readFile(configPath(), 'utf8');
      const filename = 'other.homenet_bridge.yaml.2026-01-01T00-00-00-000Z.agent_backup.bak';
      await fs.mkdir(path.join(configDir, 'backups'), { recursive: true });
      await fs.writeFile(backupPath(filename), current, 'utf8');

      const denied = await deleteBridge({ backupFilename: filename, confirm: true });
      expect(denied.status).toBe(400);
      expect(denied.body.error).toBe('BACKUP_TARGET_MISMATCH');
      await expect(fs.access(configPath())).resolves.toBeUndefined();
    });

    it('deletes the YAML after a matching backup and requests a restart', async () => {
      const backup = await createBackup('before_delete');

      const deleted = await deleteBridge({
        backupFilename: backup.filename,
        confirm: true,
      });

      expect(deleted.status).toBe(200);
      expect(deleted.body).toMatchObject({
        success: true,
        deleted: true,
        portId: 'default',
        configFile: CONFIG_FILE,
        backupFilename: backup.filename,
        loaded: true,
        remainingConfigFiles: 0,
        initMarkerRemoved: false,
        restartRequired: true,
        restartInitiated: true,
      });
      await expect(fs.access(configPath())).rejects.toMatchObject({ code: 'ENOENT' });
      expect(harness.removeCurrentConfig).toHaveBeenCalledWith(0);
      expect(harness.rebuildPortMappings).toHaveBeenCalledTimes(1);
      expect(harness.requestRestart).toHaveBeenCalledTimes(1);
    });

    it('removes the init marker when the last config is deleted', async () => {
      const marker = path.join(configDir, '.initialized');
      await fs.writeFile(marker, 'initialized', 'utf8');
      const backup = await createBackup('before_delete');

      const deleted = await deleteBridge({
        backupFilename: backup.filename,
        confirm: true,
      });

      expect(deleted.status).toBe(200);
      expect(deleted.body).toMatchObject({ remainingConfigFiles: 0, initMarkerRemoved: true });
      await expect(fs.access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('keeps the init marker when another config remains', async () => {
      const marker = path.join(configDir, '.initialized');
      await fs.writeFile(marker, 'initialized', 'utf8');
      await fs.writeFile(
        path.join(configDir, 'second.homenet_bridge.yaml'),
        yaml.dump({
          homenet_bridge: {
            ...buildRawConfig(),
            serial: { ...buildRawConfig().serial, portId: 'second' },
          },
        }),
        'utf8',
      );
      const backup = await createBackup('before_delete');

      const deleted = await deleteBridge({
        backupFilename: backup.filename,
        confirm: true,
      });

      expect(deleted.status).toBe(200);
      expect(deleted.body).toMatchObject({ remainingConfigFiles: 1, initMarkerRemoved: false });
      await expect(fs.access(marker)).resolves.toBeUndefined();
    });

    it('deletes an unloaded config file by configFile', async () => {
      const otherFile = 'other.homenet_bridge.yaml';
      const otherPath = path.join(configDir, otherFile);
      await fs.writeFile(
        otherPath,
        yaml.dump({
          homenet_bridge: {
            ...buildRawConfig(),
            serial: { ...buildRawConfig().serial, portId: 'other' },
          },
        }),
        'utf8',
      );

      const created = await request(harness.app)
        .post('/api/v1/agent/backups')
        .set('Authorization', AUTH)
        .send({ configFile: otherFile });
      expect(created.status).toBe(200);

      const deleted = await deleteBridge({
        configFile: otherFile,
        backupFilename: created.body.backup.filename,
        confirm: true,
      });

      expect(deleted.status).toBe(200);
      expect(deleted.body).toMatchObject({
        deleted: true,
        portId: null,
        configFile: otherFile,
        loaded: false,
      });
      expect(harness.removeCurrentConfig).not.toHaveBeenCalled();
      await expect(fs.access(otherPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('rejects unknown ports', async () => {
      const backup = await createBackup();
      const denied = await deleteBridge({
        portId: 'ghost',
        backupFilename: backup.filename,
        confirm: true,
      });
      expect(denied.status).toBe(404);
      expect(denied.body.error).toBe('PORT_NOT_FOUND');
    });
  });

  describe('MCP and documentation', () => {
    it('exposes backup tools over MCP', async () => {
      const list = await request(harness.app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      const names: string[] = list.body.result.tools.map((tool: { name: string }) => tool.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'list_backups',
          'create_backup',
          'get_backup',
          'restore_backup',
          'delete_bridge',
        ]),
      );

      const created = await request(harness.app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'create_backup', arguments: { reason: 'mcp_backup' } },
        });
      const backup = created.body.result.structuredContent.backup;
      expect(created.body.result.structuredContent.created).toBe(true);
      expect(backup).toMatchObject({ configFile: CONFIG_FILE, reason: 'mcp_backup' });

      const fetched = await request(harness.app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .send({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'get_backup', arguments: { filename: backup.filename } },
        });
      expect(fetched.body.result.structuredContent.yaml).toBe(backup.yaml);

      const denied = await request(harness.app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .send({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'restore_backup', arguments: { filename: backup.filename } },
        });
      expect(denied.body.result.isError).toBe(true);
      expect(denied.body.result.structuredContent.error).toBe('BACKUP_CONFIRM_REQUIRED');

      const restored = await request(harness.app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .send({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'restore_backup',
            arguments: { filename: backup.filename, confirm: true, restart: false },
          },
        });
      expect(restored.body.result.structuredContent).toMatchObject({
        success: true,
        restoredFrom: backup.filename,
        restartInitiated: false,
      });
      expect(harness.requestRestart).not.toHaveBeenCalled();
    });

    it('deletes a bridge over MCP only with a matching backup', async () => {
      const created = await request(harness.app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'create_backup', arguments: { reason: 'before_delete' } },
        });
      const backup = created.body.result.structuredContent.backup;

      const denied = await request(harness.app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'delete_bridge', arguments: { confirm: true } },
        });
      expect(denied.body.result.isError).toBe(true);
      expect(denied.body.result.structuredContent.error).toBe('BACKUP_REQUIRED');

      const deleted = await request(harness.app)
        .post('/api/v1/agent/mcp')
        .set('Authorization', AUTH)
        .send({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'delete_bridge',
            arguments: { backupFilename: backup.filename, confirm: true },
          },
        });

      expect(deleted.body.result.structuredContent).toMatchObject({
        success: true,
        deleted: true,
        configFile: CONFIG_FILE,
        backupFilename: backup.filename,
        restartInitiated: true,
      });
      await expect(fs.access(configPath())).rejects.toMatchObject({ code: 'ENOENT' });
      expect(harness.requestRestart).toHaveBeenCalledTimes(1);
    });

    it('documents the backup endpoints and feature', async () => {
      const openapi = await request(harness.app).get('/api/v1/agent/openapi.json');
      expect(openapi.body.paths['/backups'].get).toBeDefined();
      expect(openapi.body.paths['/backups'].post).toBeDefined();
      expect(openapi.body.paths['/backups/restore'].post).toBeDefined();
      expect(openapi.body.paths['/backups/{filename}'].get).toBeDefined();
      expect(openapi.body.paths['/bridges/delete'].post).toBeDefined();
      expect(openapi.body.components.schemas.RestoreBackupRequest.required).toEqual([
        'filename',
        'confirm',
      ]);
      expect(openapi.body.components.schemas.DeleteBridgeRequest.required).toEqual([
        'backupFilename',
        'confirm',
      ]);

      const llms = await request(harness.app).get('/api/v1/agent/llms.txt');
      expect(llms.text).toContain('list_backups');
      expect(llms.text).toContain('/backups/restore');
      expect(llms.text).toContain('delete_bridge');
      expect(llms.text).toContain('/bridges/delete');

      const capabilities = await request(harness.app)
        .get('/api/v1/agent/capabilities')
        .set('Authorization', AUTH);
      expect(capabilities.body.features.backups).toBe(true);
      expect(capabilities.body.features.bridgeDelete).toBe(true);
    });
  });
});
