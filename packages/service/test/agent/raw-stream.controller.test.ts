import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@rs485-homenet/core', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { createRawStreamController } from '../../src/agent/raw-stream.controller.js';
import type { BridgeInstance } from '../../src/types/index.js';

const makeBridge = () => ({
  bridge: {
    startRawPacketListener: vi.fn(),
    stopRawPacketListener: vi.fn(),
  },
  configFile: 'a.yaml',
  resolvedPath: '/tmp/a.yaml',
  config: {},
});

describe('raw stream controller', () => {
  let bridgeA: ReturnType<typeof makeBridge>;
  let bridgeB: ReturnType<typeof makeBridge>;
  let controller: ReturnType<typeof createRawStreamController>;

  beforeEach(() => {
    bridgeA = makeBridge();
    bridgeB = makeBridge();
    controller = createRawStreamController(() => [bridgeA, bridgeB] as unknown as BridgeInstance[]);
  });

  it('starts all listeners on the first acquire only', () => {
    controller.acquire();
    expect(controller.getCount()).toBe(1);
    expect(bridgeA.bridge.startRawPacketListener).toHaveBeenCalledTimes(1);
    expect(bridgeB.bridge.startRawPacketListener).toHaveBeenCalledTimes(1);

    controller.acquire();
    expect(controller.getCount()).toBe(2);
    expect(bridgeA.bridge.startRawPacketListener).toHaveBeenCalledTimes(1);
  });

  it('stops listeners when the last consumer releases', () => {
    controller.acquire();
    controller.acquire();

    controller.release();
    expect(controller.getCount()).toBe(1);
    expect(bridgeA.bridge.stopRawPacketListener).not.toHaveBeenCalled();

    controller.release();
    expect(controller.getCount()).toBe(0);
    expect(bridgeA.bridge.stopRawPacketListener).toHaveBeenCalledTimes(1);
    expect(bridgeB.bridge.stopRawPacketListener).toHaveBeenCalledTimes(1);
  });

  it('ignores release when no consumer holds the stream', () => {
    controller.release();
    expect(controller.getCount()).toBe(0);
    expect(bridgeA.bridge.stopRawPacketListener).not.toHaveBeenCalled();
  });

  it('restarts listeners after dropping to zero and acquiring again', () => {
    controller.acquire();
    controller.release();
    controller.acquire();

    expect(bridgeA.bridge.startRawPacketListener).toHaveBeenCalledTimes(2);
    expect(controller.getCount()).toBe(1);
  });

  it('keeps other bridges running when one listener throws', () => {
    bridgeA.bridge.startRawPacketListener.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => controller.acquire()).not.toThrow();
    expect(bridgeB.bridge.startRawPacketListener).toHaveBeenCalledTimes(1);
  });
});
