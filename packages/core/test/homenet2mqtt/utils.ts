import { vi } from 'vitest';
import { Buffer } from 'buffer';
import * as path from 'path';
import { access } from 'fs/promises';
import { loadConfig } from '../../src/config';
import { PacketProcessor } from '../../src/protocol/packet-processor';
import { StateManager } from '../../src/state/state-manager';
import { MqttPublisher } from '../../src/transports/mqtt/publisher';
import { clearStateCache } from '../../src/state/store';
import { CommandManager } from '../../src/service/command.manager';
import { HomenetBridgeConfig } from '../../src/config/types';
import { findEntityById } from '../../src/utils/entities';

// Mock MqttPublisher
export const publishMock = vi.fn();
export const mqttPublisherMock = {
  publish: publishMock,
} as unknown as MqttPublisher;

// Mock Bridge for PacketProcessor (EntityStateProvider)
export const bridgeMock = {
  getLightState: vi.fn(),
  getClimateState: vi.fn(),
};

export interface TestContext {
  packetProcessor: PacketProcessor;
  stateManager: StateManager;
  commandManager: CommandManager;
  portId: string;
  config: HomenetBridgeConfig;
  mockSerialPort: any;
}

const DEFAULT_TOPIC_PREFIX = 'homenet2mqtt/homedevice1';

export async function setupTest(configPath: string): Promise<TestContext> {
  vi.clearAllMocks();
  let absolutePath = path.resolve(__dirname, '../../config', configPath);

  try {
    await access(absolutePath);
  } catch {
    const examplePath = path.resolve(__dirname, '../../config/examples', configPath);
    await access(examplePath);
    absolutePath = examplePath;
  }

  const config = await loadConfig(absolutePath);
  // Override defaults for faster testing
  if (!config.packet_defaults) config.packet_defaults = {};
  config.packet_defaults.tx_retry_cnt = 0;
  config.packet_defaults.tx_timeout = 10;
  config.packet_defaults.tx_delay = 5;

  const portId = config.serials[0]?.portId || 'default';
  clearStateCache();

  // Create fresh Mock SerialPort for each test to ensure isolation
  const mockSerialPort = {
    write: vi.fn((data, cb) => cb && cb()),
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    removeListener: vi.fn(),
    destroy: vi.fn(),
  } as any;

  const packetProcessor = new PacketProcessor(config, bridgeMock);
  const stateManager = new StateManager(
    portId,
    config,
    packetProcessor,
    mqttPublisherMock,
    DEFAULT_TOPIC_PREFIX,
  );

  const commandManager = new CommandManager(mockSerialPort, config, portId, packetProcessor);

  return { packetProcessor, stateManager, commandManager, portId, config, mockSerialPort };
}

export function processPacket(stateManager: StateManager, packet: Buffer | number[]) {
  const data = Buffer.isBuffer(packet) ? packet : Buffer.from(packet);
  stateManager.processIncomingData(data);
}

export async function executeCommand(
  ctx: TestContext,
  entityId: string,
  commandName: string,
  value: any,
) {
  const entity = findEntityById(ctx.config, entityId);
  if (!entity) throw new Error(`Entity ${entityId} not found`);

  const packet = ctx.packetProcessor.constructCommandPacket(entity, commandName, value);
  if (!packet) throw new Error(`Could not construct packet for ${entityId} ${commandName}`);

  await ctx.commandManager.send(entity, packet);
}
