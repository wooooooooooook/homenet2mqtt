import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/state-manager.js';
import { PacketProcessor } from '../../src/protocol/packet-processor.js';
import { HomenetBridgeConfig } from '../../src/config/types.js';

describe('Local State Persistence Cache', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homenet-test-'));
    configPath = path.join(tempDir, 'homenet_bridge.yaml');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should save and load entity states to/from disk', async () => {
    const config: HomenetBridgeConfig = {
      serial: {
        portId: 'test-port',
        path: '/dev/null',
        baud_rate: 9600,
        data_bits: 8,
        parity: 'none',
        stop_bits: 1,
      },
      light: [{ id: 'light.livingroom', name: 'Living Room Light' }],
    };

    const packetProcessor = new PacketProcessor(config, { getEntityState: () => undefined } as any);
    const stateManager = new StateManager(
      'test-port',
      config,
      packetProcessor,
      'homenet',
      new Map(),
      undefined,
      configPath,
    );

    // Update state to trigger save states
    stateManager.updateEntityState('light.livingroom', { state: 'ON' });

    // Wait for debounced write (1.5 seconds)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Verify cache file was created
    const cacheFilePath = path.join(tempDir, 'states_cache.json');
    expect(fs.existsSync(cacheFilePath)).toBe(true);

    const cacheContent = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
    expect(cacheContent['light.livingroom']).toEqual({ state: 'ON' });

    // Create a new StateManager to load from disk
    const nextStateManager = new StateManager(
      'test-port',
      config,
      packetProcessor,
      'homenet',
      new Map(),
      undefined,
      configPath,
    );

    const restoredState = nextStateManager.getEntityState('light.livingroom');
    expect(restoredState).toEqual({ state: 'ON' });
  });
});
