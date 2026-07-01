import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateManager } from '../../src/state/state-manager.js';
import { PacketProcessor } from '../../src/protocol/packet-processor.js';
import { MqttPublisher } from '../../src/transports/mqtt/publisher.js';
import { HomenetBridgeConfig } from '../../src/config/types.js';

describe('StateManager Optimistic Initialization and RestoreMode', () => {
  let stateManager: StateManager;
  let mockPacketProcessor: PacketProcessor;
  let mockMqttPublisher: MqttPublisher;
  let config: HomenetBridgeConfig;
  const PORT_ID = 'test-port';
  const TOPIC_PREFIX = 'homenet';

  beforeEach(() => {
    mockPacketProcessor = {
      on: vi.fn(),
      processChunk: vi.fn(),
    } as any;

    mockMqttPublisher = {
      publish: vi.fn(),
    } as any;

    config = {
      serial: {
        portId: PORT_ID,
        path: '/dev/mock',
      },
    };
  });

  it('should handle ALWAYS_ON mode', () => {
    config.switch = [
      {
        id: 'always_on_switch',
        name: 'Always ON Switch',
        type: 'switch',
        optimistic: true,
        restore_mode: 'ALWAYS_ON',
      } as any,
    ];

    stateManager = new StateManager(
      PORT_ID,
      config,
      mockPacketProcessor,
      mockMqttPublisher,
      TOPIC_PREFIX,
    );

    expect(stateManager.getEntityState('always_on_switch')).toEqual({ state: 'ON' });
  });

  it('should handle ALWAYS_OFF mode', () => {
    config.switch = [
      {
        id: 'always_off_switch',
        name: 'Always OFF Switch',
        type: 'switch',
        optimistic: true,
        restore_mode: 'ALWAYS_OFF',
      } as any,
    ];

    stateManager = new StateManager(
      PORT_ID,
      config,
      mockPacketProcessor,
      mockMqttPublisher,
      TOPIC_PREFIX,
    );

    expect(stateManager.getEntityState('always_off_switch')).toEqual({ state: 'OFF' });
  });

  it('should handle RESTORE_DEFAULT_ON when no retained state', () => {
    config.switch = [
      {
        id: 'restore_switch',
        name: 'Restore Switch',
        type: 'switch',
        optimistic: true,
        restore_mode: 'RESTORE_DEFAULT_ON',
      } as any,
    ];

    stateManager = new StateManager(
      PORT_ID,
      config,
      mockPacketProcessor,
      mockMqttPublisher,
      TOPIC_PREFIX,
    );

    expect(stateManager.getEntityState('restore_switch')).toBeUndefined();

    stateManager.initializeRestorableOptimisticDefaults(config);

    expect(stateManager.getEntityState('restore_switch')).toEqual({ state: 'ON' });
  });

  it('should handle RESTORE_INVERTED_DEFAULT_OFF with retained state', () => {
    config.switch = [
      {
        id: 'inverted_switch',
        name: 'Inverted Switch',
        type: 'switch',
        optimistic: true,
        restore_mode: 'RESTORE_INVERTED_DEFAULT_OFF',
      } as any,
    ];

    stateManager = new StateManager(
      PORT_ID,
      config,
      mockPacketProcessor,
      mockMqttPublisher,
      TOPIC_PREFIX,
    );

    // Simulate restoring 'ON' from MQTT
    stateManager.restoreEntityState('inverted_switch', { state: 'ON' });

    // It should be inverted to 'OFF'
    expect(stateManager.getEntityState('inverted_switch')).toEqual({ state: 'OFF' });

    stateManager.initializeRestorableOptimisticDefaults(config);
    // Should still be 'OFF'
    expect(stateManager.getEntityState('inverted_switch')).toEqual({ state: 'OFF' });
  });

  it('should handle RESTORE_INVERTED_DEFAULT_OFF without retained state', () => {
    config.switch = [
      {
        id: 'inverted_switch',
        name: 'Inverted Switch',
        type: 'switch',
        optimistic: true,
        restore_mode: 'RESTORE_INVERTED_DEFAULT_OFF',
      } as any,
    ];

    stateManager = new StateManager(
      PORT_ID,
      config,
      mockPacketProcessor,
      mockMqttPublisher,
      TOPIC_PREFIX,
    );

    stateManager.initializeRestorableOptimisticDefaults(config);
    // Should fall back to 'OFF'
    expect(stateManager.getEntityState('inverted_switch')).toEqual({ state: 'OFF' });
  });

  it('should maintain backward compatibility with restore_state: true', () => {
    config.switch = [
      {
        id: 'legacy_switch',
        name: 'Legacy Switch',
        type: 'switch',
        optimistic: true,
        restore_state: true,
      } as any,
    ];

    stateManager = new StateManager(
      PORT_ID,
      config,
      mockPacketProcessor,
      mockMqttPublisher,
      TOPIC_PREFIX,
    );

    stateManager.restoreEntityState('legacy_switch', { state: 'ON' });
    expect(stateManager.getEntityState('legacy_switch')).toEqual({ state: 'ON' });
  });
});
