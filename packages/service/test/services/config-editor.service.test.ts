import { describe, expect, it } from 'vitest';
import {
  createConfigEditorService,
  type ConfigEditorDeps,
} from '../../src/services/config-editor.service.js';

describe('config-editor.service', () => {
  const dummyDeps: ConfigEditorDeps = {
    configDir: '/dummy',
    defaultConfigFilename: 'default.homenet_bridge.yaml',
    configRestartFlag: '/dummy/restart',
    fileExists: async () => true,
    dumpConfigToYaml: () => '',
    saveBackup: async () => '',
    triggerRestart: async () => {},
    configRateLimiter: { check: () => true },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };

  const service = createConfigEditorService(dummyDeps);

  describe('isValidConfigFilename', () => {
    it('should accept valid yaml filenames', () => {
      expect(service.isValidConfigFilename('default.homenet_bridge.yaml')).toBe(true);
      expect(service.isValidConfigFilename('homenet_bridge.yaml')).toBe(true);
      expect(service.isValidConfigFilename('custom_bridge.yml')).toBe(true);
    });

    it('should reject path traversal attempts', () => {
      expect(service.isValidConfigFilename('sub/homenet_bridge.yaml')).toBe(false);
      expect(service.isValidConfigFilename('../homenet_bridge.yaml')).toBe(false);
      expect(service.isValidConfigFilename('..\\homenet_bridge.yaml')).toBe(false);
    });

    it('should reject non-yaml filenames', () => {
      expect(service.isValidConfigFilename('homenet_bridge.json')).toBe(false);
      expect(service.isValidConfigFilename('default.homenet_bridge')).toBe(false);
      expect(service.isValidConfigFilename('txt')).toBe(false);
    });
  });
});
