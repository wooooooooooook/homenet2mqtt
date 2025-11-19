// packages/core/src/index.ts
import dotenv from 'dotenv';
import { HomeNetBridge } from './service/bridge.service.js';
import type { BridgeOptions } from './service/bridge.service.js';

dotenv.config();

export { HomeNetBridge, BridgeOptions };

export async function createBridge(configPath: string, mqttUrl: string) {
  const bridge = new HomeNetBridge({ configPath, mqttUrl });
  await bridge.start();
  return bridge;
}