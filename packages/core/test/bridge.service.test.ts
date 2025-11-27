
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { HomeNetBridge } from '../src/service/bridge.service';
import { eventBus } from '../src/service/event-bus.js';

// Mocks
const mockSerialPortInstances: any[] = [];
vi.mock('serialport', () => {
  const SerialPortMock = class extends EventEmitter {
    constructor() {
      super();
      mockSerialPortInstances.push(this);
    }
    write = vi.fn();
    open(callback: (err?: Error | null) => void) {
      callback?.(null);
    }
    destroy = vi.fn();
  };
  return { SerialPort: SerialPortMock };
});

vi.mock('mqtt', () => ({
  default: {
    connect: () => ({
      publish: vi.fn(),
      subscribe: vi.fn(),
      on: vi.fn(),
      end: vi.fn(),
      connected: true,
    }),
  },
}));

vi.mock('../src/state/state-manager.js', () => ({
  StateManager: vi.fn().mockImplementation(() => ({
    processIncomingData: vi.fn(),
  })),
}));

vi.mock('../src/config/index.js', () => ({
  loadConfig: () =>
    Promise.resolve({
      serial: { baud_rate: 9600 },
    }),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn().mockResolvedValue(undefined),
}));

describe('HomeNetBridge Packet Interval Analysis', () => {
  let bridge: HomeNetBridge;
  let fakeSerialPort: EventEmitter;
  const eventBusEmitSpy = vi.spyOn(eventBus, 'emit');

  beforeEach(async () => {
    vi.useFakeTimers();
    bridge = new HomeNetBridge({
      configPath: 'test.yaml',
      mqttUrl: 'mqtt://fake',
    });
    await bridge.start();

    // The serial port instance is created inside start()
    // We need a way to get a reference to it.
    // This is a bit of a hack, but we'll assume the mock is instantiated.
    // A better approach would be dependency injection.
    fakeSerialPort = mockSerialPortInstances[mockSerialPortInstances.length - 1];
  });

  afterEach(() => {
    eventBusEmitSpy.mockClear();
    vi.useRealTimers();
    bridge.stop();
  });

  it('should calculate interval between packets and emit raw-data-with-interval event', () => {
    const data = Buffer.from([0x01, 0x02, 0x03]);

    // First packet
    fakeSerialPort.emit('data', data);
    expect(eventBusEmitSpy).toHaveBeenCalledWith('raw-data-with-interval', {
      payload: '010203',
      interval: null,
      receivedAt: expect.any(String),
    });

    // Second packet after 50ms
    vi.advanceTimersByTime(50);
    fakeSerialPort.emit('data', data);
    expect(eventBusEmitSpy).toHaveBeenCalledWith('raw-data-with-interval', {
      payload: '010203',
      interval: 50,
      receivedAt: expect.any(String),
    });
  });

  it('should not emit stats if fewer than 100 packets have been received', () => {
    for (let i = 0; i < 99; i++) {
      fakeSerialPort.emit('data', Buffer.from([i]));
      vi.advanceTimersByTime(10);
    }
    expect(eventBusEmitSpy).not.toHaveBeenCalledWith('packet-interval-stats', expect.any(Object));
  });

  it('should calculate and emit packet interval stats after 101 packets', () => {
    // 100 intervals: 99 short, 1 long
    for (let i = 0; i < 100; i++) {
      fakeSerialPort.emit('data', Buffer.from([i]));
      vi.advanceTimersByTime(10); // 10ms interval
    }

    // 101st packet after a long interval
    vi.advanceTimersByTime(200);
    fakeSerialPort.emit('data', Buffer.from([100]));

    // The stats are calculated based on the 100 intervals collected so far.
    // Let's manually calculate the expected averages.
    const intervals = Array(99).fill(10).concat([200]);
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stdDev = Math.sqrt(
      intervals.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / intervals.length
    );
    const threshold = mean + 1.5 * stdDev;

    // 200 should be above the threshold
    const expectedPacketAvg = 10;
    const expectedIdleAvg = 210;

    expect(eventBusEmitSpy).toHaveBeenCalledWith('packet-interval-stats', {
      packetAvg: expectedPacketAvg,
      idleAvg: expectedIdleAvg,
      sampleSize: 100,
    });
  });
});
