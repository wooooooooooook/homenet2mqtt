import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Duplex } from 'stream';
import { MqttSubscriber } from '../src/transports/mqtt/subscriber.js';
import { MqttClient } from '../src/transports/mqtt/mqtt.client.js';
import { CommandManager } from '../src/service/command.manager.js';
import { HomenetBridgeConfig } from '../src/config/types.js';

describe('MqttSubscriber.setupSubscriptions', () => {
  let subscribeMock: ReturnType<typeof vi.fn>;
  let onMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    subscribeMock = vi.fn((_, callback?: (err?: Error | null) => void) => callback?.(null));
    onMock = vi.fn();
  });

  it('엔티티별 /set, /+/set 토픽만 구독한다', () => {
    const mqttClient = {
      client: {
        on: onMock,
        subscribe: subscribeMock,
      },
    } as unknown as MqttClient;

    const config = {
      serial: {
        portId: 'main',
        path: '/dev/ttyUSB0',
        baud_rate: 9600,
        data_bits: 8,
        parity: 'none',
        stop_bits: 1,
      },
      mqtt: {
        brokerUrl: 'mqtt://localhost',
      },
      light: [
        {
          id: 'light_1',
          name: 'Light 1',
          type: 'light',
          state: { data: [0x00] },
          command_on: { data: [0x01] },
          command_off: { data: [0x00] },
        },
      ],
    } as unknown as HomenetBridgeConfig;

    const commandManager = new CommandManager(
      {
        write: vi.fn(),
      } as unknown as Duplex,
      config,
      'main',
    );

    const subscriber = new MqttSubscriber(
      mqttClient,
      'main',
      config,
      { constructCommandPacket: vi.fn() } as any,
      commandManager,
      'homenet2mqtt/main',
    );

    subscriber.setupSubscriptions();

    const topics = subscribeMock.mock.calls.map((call) => call[0]);
    expect(topics).toEqual(['homenet2mqtt/main/light_1/set', 'homenet2mqtt/main/light_1/+/set']);
    expect(topics).not.toContain('homenet2mqtt/main/light_1/#');
  });
});
