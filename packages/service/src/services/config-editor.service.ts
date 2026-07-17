import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import yaml from 'js-yaml';

export type ConfigEditorDeps = {
  configDir: string;
  defaultConfigFilename: string;
  configRestartFlag: string;
  fileExists: (targetPath: string) => Promise<boolean>;
  dumpConfigToYaml: (
    config: Partial<HomenetBridgeConfig> | Record<string, any>,
    options?: yaml.DumpOptions,
  ) => string;
  saveBackup: (configPath: string, config: any, reason: string) => Promise<string>;
  triggerRestart: () => Promise<void>;
  configRateLimiter: { check: (key: string) => boolean };
  logger: {
    info: (msg: string | Record<string, unknown>, ...args: unknown[]) => void;
    warn: (msg: string | Record<string, unknown>, ...args: unknown[]) => void;
    error: (msg: string | Record<string, unknown>, ...args: unknown[]) => void;
  };
};

export type ConfigEditorService = {
  deps: ConfigEditorDeps;
  isValidConfigFilename: (filename: string) => boolean;
};

export const createConfigEditorService = (deps: ConfigEditorDeps): ConfigEditorService => {
  const isValidConfigFilename = (filename: string): boolean => {
    if (!filename || filename.includes('/') || filename.includes('\\')) {
      return false;
    }
    // Allow any .yaml or .yml file to accommodate customized filenames like homenet_bridge.yaml
    return /\.ya?ml$/.test(filename);
  };

  return {
    deps,
    isValidConfigFilename,
  };
};
