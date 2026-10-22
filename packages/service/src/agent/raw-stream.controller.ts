import { logger } from '@rs485-homenet/core';
import type { BridgeInstance } from '../types/index.js';

export interface RawStreamController {
  acquire: () => void;
  release: () => void;
  getCount: () => number;
}

export function createRawStreamController(getBridges: () => BridgeInstance[]): RawStreamController {
  let refCount = 0;

  const startAll = () => {
    for (const instance of getBridges()) {
      try {
        instance.bridge.startRawPacketListener();
      } catch (error) {
        logger.warn(
          { err: error, configFile: instance.configFile },
          '[raw-stream] Failed to start raw packet listener',
        );
      }
    }
  };

  const stopAll = () => {
    for (const instance of getBridges()) {
      try {
        instance.bridge.stopRawPacketListener();
      } catch (error) {
        logger.warn(
          { err: error, configFile: instance.configFile },
          '[raw-stream] Failed to stop raw packet listener',
        );
      }
    }
  };

  return {
    acquire: () => {
      refCount += 1;
      if (refCount === 1) {
        logger.info('[raw-stream] Starting shared raw packet listeners');
        startAll();
      }
    },
    release: () => {
      if (refCount === 0) return;
      refCount -= 1;
      if (refCount === 0) {
        logger.info('[raw-stream] Stopping shared raw packet listeners');
        stopAll();
      }
    },
    getCount: () => refCount,
  };
}
