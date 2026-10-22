import { describe, it, expect, vi } from 'vitest';
import { DiscoveryManager } from '../../src/mqtt/discovery-manager.js';
import { MqttPublisher } from '../../src/transports/mqtt/publisher.js';
import { MqttSubscriber } from '../../src/transports/mqtt/subscriber.js';
import type { HomenetBridgeConfig } from '../../src/config/types.js';
import { normalizeConfig } from '../../src/config/index.js';

const createManager = () => {
  const publisher = { publish: vi.fn() } as unknown as MqttPublisher;
  const subscriber = { subscribe: vi.fn() } as unknown as MqttSubscriber;

  const config = normalizeConfig({
    serial: {
      portId: 'main',
      path: '/dev/ttyUSB0',
      baud_rate: 9600,
      data_bits: 8,
      parity: 'none',
      stop_bits: 1,
    },
    sensor: [
      {
        id: 'sensor1',
        name: 'Test Sensor',
        state: { index: 0, length: 1, type: 'byte' },
      },
    ],
  } as unknown as HomenetBridgeConfig);

  const manager = new DiscoveryManager('main', config, publisher, subscriber, 'homenet2mqtt/main');

  return { manager, publisher, config };
};

describe('DiscoveryManager.buildDiscovery', () => {
  it('returns the discovery topic and payload without publishing', () => {
    const { manager, publisher, config } = createManager();
    const callsBefore = publisher.publish.mock.calls.length;

    const discovery = manager.buildDiscovery(config.sensor![0] as any, 'sensor');

    expect(discovery).not.toBeNull();
    expect(discovery!.topic).toBe('homeassistant/sensor/homenet_main_sensor1/config');
    expect(discovery!.payload).toMatchObject({
      name: 'Test Sensor',
      unique_id: 'homenet_main_sensor1',
      state_topic: 'homenet2mqtt/main/sensor1/state',
      default_entity_id: 'sensor.test_sensor',
    });
    expect(publisher.publish).toHaveBeenCalledTimes(callsBefore);
  });

  it('resolves the entity type from the normalized config', () => {
    const { manager, config } = createManager();

    const discovery = manager.buildDiscovery(config.sensor![0] as any);

    expect(discovery!.topic).toBe('homeassistant/sensor/homenet_main_sensor1/config');
  });

  it('adds command topics for controllable entity types', () => {
    const { manager } = createManager();

    const discovery = manager.buildDiscovery(
      { id: 'switch1', name: 'Test Switch', type: 'switch' } as any,
      'switch',
    );

    expect(discovery!.payload).toMatchObject({
      command_topic: 'homenet2mqtt/main/switch1/set',
      state_topic: 'homenet2mqtt/main/switch1/state',
    });
  });

  it('returns null when the entity has no id or type', () => {
    const { manager } = createManager();

    expect(manager.buildDiscovery({ name: 'No id' } as any, 'sensor')).toBeNull();
    expect(manager.buildDiscovery({ id: 'no_type' } as any)).toBeNull();
  });
});
