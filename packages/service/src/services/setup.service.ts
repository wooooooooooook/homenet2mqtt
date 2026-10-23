import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { discoverConfigFiles, resolveSecurePath } from '../utils/helpers.js';
import { type HomenetBridgeConfig, normalizeConfig, normalizePortId } from '@rs485-homenet/core';
import type { SerialConfig } from '@rs485-homenet/core/config/types';
import { createSerialPortConnection } from '@rs485-homenet/core/transports/serial/serial.factory';
import { ConfigItemsError } from './config-items.service.js';

export type SetupWizardState = {
  defaultConfigName: string | null;
  hasDefaultConfig: boolean;
  hasInitMarker: boolean;
  requiresInitialization: boolean;
  configFiles: string[];
};

export type SetupOverview = {
  configRoot: string;
  examples: string[];
  defaultConfigName: string | null;
  hasDefaultConfig: boolean;
  hasInitMarker: boolean;
  requiresInitialization: boolean;
  hasCustomConfig: boolean;
  configFiles: string[];
};

export type SetupExampleSerialInfo = {
  serial: Record<string, unknown>;
  packetDefaults: Record<string, unknown>;
};

export type SetupExampleEntity = {
  id?: string;
  name?: string;
};

export type SetupSerialTestRequest = {
  filename?: string;
  serialPath?: string;
  serialConfig?: unknown;
  portId?: string;
};

export type SetupSerialTestResult = {
  ok: true;
  portId: string;
  packets: string[];
};

export type SetupSelectionRequest = {
  filename?: string;
  serialPath?: string;
  serialConfig?: unknown;
  portId?: string;
  packetDefaults?: Record<string, unknown>;
  selectedEntities?: Record<string, unknown>;
  mode?: 'init' | 'add';
};

export type SetupApplyResult = {
  ok: true;
  target: string;
  restartScheduled: boolean;
  requiresManualConfigUpdate: boolean;
};

export type SetupWizardDeps = {
  configDir: string;
  examplesDir: string;
  defaultConfigFilename: string;
  configInitMarker: string;
  configRestartFlag: string;
  envConfigFilesSource: string | null;
  fileExists: (targetPath: string) => Promise<boolean>;
  dumpConfigToYaml: (
    config: Partial<HomenetBridgeConfig> | Record<string, any>,
    options?: yaml.DumpOptions,
  ) => string;
  saveBackup: (configPath: string, config: any, reason: string) => Promise<string>;
  triggerRestart: () => Promise<void>;
  serialTestRateLimiter: { check: (key: string) => boolean };
  configRateLimiter?: { check: (key: string) => boolean };
  logger: {
    info: (msg: string | Record<string, unknown>, ...args: unknown[]) => void;
    warn: (msg: string | Record<string, unknown>, ...args: unknown[]) => void;
    error: (msg: string | Record<string, unknown>, ...args: unknown[]) => void;
  };
  getLoadedConfigs: () => HomenetBridgeConfig[];
};

export type SetupWizardService = {
  getInitializationState: () => Promise<SetupWizardState>;
  listExampleConfigs: () => Promise<string[]>;
  getDefaultConfigFilename: () => Promise<string | null>;
  getNextConfigFilename: () => Promise<string>;
  checkDuplicateSerial: (
    targetPath: string,
    targetPortId?: string,
  ) => Promise<{ error: string } | null>;
  getSetupOverview: () => Promise<SetupOverview>;
  getExampleSerialInfo: (filename: string) => Promise<SetupExampleSerialInfo>;
  getExampleEntities: (filename: string) => Promise<Record<string, SetupExampleEntity[]>>;
  testSerial: (request: SetupSerialTestRequest) => Promise<SetupSerialTestResult>;
  applySetupSelection: (request: SetupSelectionRequest) => Promise<SetupApplyResult>;
  // Exposed for route handler usage
  deps: SetupWizardDeps;
  // Constants exposed for route handlers if needed, or helper methods
  applySerialPathToConfig: typeof applySerialPathToConfig;
  parseSerialConfigPayload: typeof parseSerialConfigPayload;
  buildEmptyConfig: typeof buildEmptyConfig;
  extractSerialConfig: typeof extractSerialConfig;
  collectSerialPackets: typeof collectSerialPackets;
};

export const EMPTY_CONFIG_SENTINEL = '__empty__';
export const SERIAL_DATA_BITS = [5, 6, 7, 8] as const;
export const SERIAL_PARITY = ['none', 'even', 'mark', 'odd', 'space'] as const;
export const SERIAL_STOP_BITS = [1, 1.5, 2] as const;

export const ENTITY_TYPE_KEYS = [
  'light',
  'climate',
  'valve',
  'button',
  'sensor',
  'fan',
  'switch',
  'lock',
  'number',
  'select',
  'text_sensor',
  'text',
  'binary_sensor',
] as const;

export const DEFAULT_PACKET_DEFAULTS = {
  rx_timeout: '10ms',
  tx_timeout: '500ms',
  tx_delay: '50ms',
  tx_retry_cnt: 3,
};

const IPV4_WITHOUT_PORT_PATTERN = /^(\d{1,3})(?:\.(\d{1,3})){3}$/;

export const validateSerialPath = (serialPath: string): { error: string } | null => {
  const normalizedPath = serialPath.trim();

  if (!normalizedPath) {
    return { error: 'SERIAL_PATH_REQUIRED' };
  }

  if (IPV4_WITHOUT_PORT_PATTERN.test(normalizedPath)) {
    const octets = normalizedPath.split('.').map((value) => Number(value));
    const isValidIpv4 = octets.every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 255,
    );
    if (isValidIpv4) {
      return { error: 'SERIAL_TCP_PORT_REQUIRED' };
    }
  }

  return null;
};

const applySerialPathToConfig = (
  configObject: unknown,
  serialPath: string,
  portId?: string,
  packetDefaults?: Record<string, unknown>,
): boolean => {
  if (!configObject || typeof configObject !== 'object') {
    return false;
  }

  const bridgeConfig = (configObject as Record<string, unknown>).homenet_bridge || configObject;

  if (!bridgeConfig || typeof bridgeConfig !== 'object') {
    return false;
  }

  let updated = false;
  const normalizedPath = serialPath.trim();
  const normalizedPortId = portId?.trim();

  if ((bridgeConfig as Record<string, unknown>).serial) {
    const serial = (bridgeConfig as Record<string, unknown>).serial as Record<string, unknown>;
    const updatedSerial: Record<string, unknown> = { ...serial, path: normalizedPath };
    if (normalizedPortId) {
      updatedSerial.portId = normalizedPortId;
    }
    (bridgeConfig as Record<string, unknown>).serial = updatedSerial;
    updated = true;
  }

  // Apply packet defaults
  if (packetDefaults) {
    (bridgeConfig as Record<string, unknown>).packet_defaults = { ...packetDefaults };
    updated = true;
  }

  return updated;
};

const parseSerialConfigPayload = (
  payload: unknown,
): { serialConfig?: SerialConfig; error?: string } => {
  if (!payload || typeof payload !== 'object') {
    return { error: 'SERIAL_CONFIG_REQUIRED' };
  }

  const data = payload as Record<string, unknown>;
  const portId = typeof data.portId === 'string' ? data.portId.trim() : '';
  const pathValue = typeof data.path === 'string' ? data.path.trim() : '';
  const baudRateValue = Number(data.baud_rate);
  const dataBitsValue = Number(data.data_bits);
  const parityValue = typeof data.parity === 'string' ? data.parity : '';
  const stopBitsValue = Number(data.stop_bits);

  if (!portId) {
    return { error: 'SERIAL_PORT_ID_REQUIRED' };
  }

  if (!pathValue) {
    return { error: 'SERIAL_PATH_REQUIRED' };
  }

  const pathValidation = validateSerialPath(pathValue);
  if (pathValidation) {
    return pathValidation;
  }

  if (!Number.isFinite(baudRateValue) || baudRateValue <= 0) {
    return { error: 'SERIAL_BAUD_RATE_INVALID' };
  }

  if (!SERIAL_DATA_BITS.includes(dataBitsValue as SerialConfig['data_bits'])) {
    return { error: 'SERIAL_DATA_BITS_INVALID' };
  }

  if (!SERIAL_PARITY.includes(parityValue as SerialConfig['parity'])) {
    return { error: 'SERIAL_PARITY_INVALID' };
  }

  if (!SERIAL_STOP_BITS.includes(stopBitsValue as SerialConfig['stop_bits'])) {
    return { error: 'SERIAL_STOP_BITS_INVALID' };
  }

  return {
    serialConfig: {
      portId,
      path: pathValue,
      baud_rate: baudRateValue,
      data_bits: dataBitsValue as SerialConfig['data_bits'],
      parity: parityValue as SerialConfig['parity'],
      stop_bits: stopBitsValue as SerialConfig['stop_bits'],
    },
  };
};

const buildEmptyConfig = (
  serialConfig: SerialConfig,
  packetDefaults?: Record<string, unknown>,
) => ({
  homenet_bridge: {
    serial: serialConfig,
    ...(packetDefaults && { packet_defaults: packetDefaults }),
  },
});

const extractSerialConfig = (config: HomenetBridgeConfig): SerialConfig | null => {
  const legacySerial = (config as { serial?: SerialConfig }).serial;
  return legacySerial ?? null;
};

const collectSerialPackets = async (
  serialPath: string,
  serialConfig: SerialConfig,
  options?: { maxPackets?: number; timeoutMs?: number },
): Promise<string[]> => {
  const maxPackets = options?.maxPackets ?? 5;
  const timeoutMs = options?.timeoutMs ?? 5000;
  const packets: string[] = [];
  const port = await createSerialPortConnection(serialPath, serialConfig, timeoutMs);

  return new Promise<string[]>((resolve, reject) => {
    let finished = false;

    const cleanup = async () => {
      if (finished) return;
      finished = true;
      port.off('data', onData);
      port.off('error', onError);

      if (
        typeof (port as any).isOpen === 'boolean' &&
        (port as any).isOpen &&
        typeof (port as any).close === 'function'
      ) {
        await new Promise<void>((resolveClose) => (port as any).close(() => resolveClose()));
      } else {
        port.destroy();
      }

      // Wait for OS to release lock
      await new Promise((r) => setTimeout(r, 500));
    };

    const timeout = setTimeout(async () => {
      await cleanup();
      resolve(packets);
    }, timeoutMs);

    const resolveWithTimeout = async (value: string[]) => {
      clearTimeout(timeout);
      await cleanup();
      resolve(value);
    };

    const rejectWithTimeout = async (error: Error) => {
      clearTimeout(timeout);
      await cleanup();
      reject(error);
    };

    const onData = (data: Buffer) => {
      packets.push(data.toString('hex').toUpperCase());
      if (packets.length >= maxPackets) {
        resolveWithTimeout(packets);
      }
    };

    const onError = (error: Error) => {
      rejectWithTimeout(error);
    };

    port.on('data', onData);
    port.once('error', onError);
  });
};

export const createSetupWizardService = (deps: SetupWizardDeps): SetupWizardService => {
  const {
    configDir,
    examplesDir,
    defaultConfigFilename,
    configInitMarker,
    configRestartFlag,
    envConfigFilesSource,
    fileExists,
    dumpConfigToYaml,
    saveBackup,
    logger,
    getLoadedConfigs,
  } = deps;

  const listExampleConfigs = async (): Promise<string[]> => {
    try {
      const files = await fs.readdir(examplesDir);
      return files.filter((file) => file.endsWith('.yaml'));
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return [];
      throw error;
    }
  };

  const getDefaultConfigFilename = async (): Promise<string | null> => {
    const defaultPath = path.join(configDir, defaultConfigFilename);

    if (await fileExists(defaultPath)) return defaultConfigFilename;
    return null;
  };

  const getInitializationState = async (): Promise<SetupWizardState> => {
    const [defaultConfigName, hasInitMarker, configFiles] = await Promise.all([
      getDefaultConfigFilename(),
      fileExists(configInitMarker),
      discoverConfigFiles(configDir),
    ]);

    return {
      defaultConfigName,
      hasDefaultConfig: Boolean(defaultConfigName),
      hasInitMarker,
      requiresInitialization: !hasInitMarker,
      configFiles,
    };
  };

  const getNextConfigFilename = async (): Promise<string> => {
    const files = await fs.readdir(configDir).catch(() => []);
    const bridgeFiles = files.filter((f) => /^default(_\d+)?\.homenet_bridge\.yaml$/.test(f));

    if (bridgeFiles.length === 0) return defaultConfigFilename;

    let maxSuffix = 1;
    for (const file of bridgeFiles) {
      if (file === defaultConfigFilename) continue;
      const match = file.match(/^default_(\d+)\.homenet_bridge\.yaml$/);
      if (match) {
        const suffix = parseInt(match[1], 10);
        if (suffix > maxSuffix) maxSuffix = suffix;
      }
    }

    return `default_${maxSuffix + 1}.homenet_bridge.yaml`;
  };

  const checkDuplicateSerial = async (
    targetPath: string,
    targetPortId?: string,
  ): Promise<{ error: string } | null> => {
    const loadedConfigs = getLoadedConfigs();

    for (const config of loadedConfigs) {
      if (!config) continue;

      const serial = config.serial;
      if (!serial) continue;

      if (targetPortId) {
        const existingPortId = normalizePortId(serial.portId, 0);
        if (existingPortId === targetPortId) {
          return { error: 'PORT_ID_DUPLICATE' };
        }
      }

      if (serial.path === targetPath) {
        return { error: 'SERIAL_PATH_DUPLICATE' };
      }
    }
    return null;
  };

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const resolveExamplePath = async (filename: string): Promise<string> => {
    if (!filename || filename.includes('/') || filename.includes('\\')) {
      throw new ConfigItemsError('INVALID_FILENAME', 'Invalid example filename.', 400);
    }

    const examples = await listExampleConfigs();
    const sourcePath = resolveSecurePath(examplesDir, filename);
    if (!sourcePath || !examples.includes(filename)) {
      throw new ConfigItemsError('EXAMPLE_NOT_FOUND', `Example "${filename}" was not found.`, 404);
    }
    return sourcePath;
  };

  const readExampleDocument = async (filename: string): Promise<unknown> => {
    const sourcePath = await resolveExamplePath(filename);

    let rawContent: string;
    try {
      rawContent = await fs.readFile(sourcePath, 'utf-8');
    } catch (error) {
      logger.error({ err: error, sourcePath }, '[service] Failed to read example config');
      throw new ConfigItemsError('EXAMPLE_READ_FAILED', 'Failed to read example config.', 500);
    }

    try {
      return yaml.load(rawContent);
    } catch (error) {
      logger.error({ err: error, sourcePath }, '[service] Failed to parse example config');
      throw new ConfigItemsError('EXAMPLE_READ_FAILED', 'Failed to read example config.', 500);
    }
  };

  const getBridgeConfig = (document: unknown): Record<string, unknown> | null => {
    if (!isRecord(document)) return null;
    const bridgeConfig = isRecord(document.homenet_bridge) ? document.homenet_bridge : document;
    return isRecord(bridgeConfig) ? bridgeConfig : null;
  };

  const getSetupOverview = async (): Promise<SetupOverview> => {
    const [state, examples] = await Promise.all([getInitializationState(), listExampleConfigs()]);

    return {
      configRoot: configDir,
      examples,
      defaultConfigName: state.defaultConfigName,
      hasDefaultConfig: state.hasDefaultConfig,
      hasInitMarker: state.hasInitMarker,
      requiresInitialization: state.requiresInitialization,
      hasCustomConfig: envConfigFilesSource !== 'default',
      configFiles: state.configFiles,
    };
  };

  const getExampleSerialInfo = async (filename: string): Promise<SetupExampleSerialInfo> => {
    if (filename === EMPTY_CONFIG_SENTINEL) {
      return {
        serial: {
          portId: 'default',
          baud_rate: 9600,
          data_bits: 8,
          parity: 'none',
          stop_bits: 1,
        },
        packetDefaults: { ...DEFAULT_PACKET_DEFAULTS },
      };
    }

    const document = await readExampleDocument(filename);
    const bridgeConfig = getBridgeConfig(document);
    const serialConfig = bridgeConfig?.serial;

    if (!isRecord(serialConfig)) {
      throw new ConfigItemsError(
        'SERIAL_CONFIG_MISSING',
        `Example "${filename}" has no serial configuration.`,
        400,
      );
    }

    const { path: _path, ...serial } = serialConfig;
    const packetDefaults = isRecord(bridgeConfig?.packet_defaults)
      ? bridgeConfig.packet_defaults
      : DEFAULT_PACKET_DEFAULTS;

    return { serial, packetDefaults: { ...packetDefaults } };
  };

  const getExampleEntities = async (
    filename: string,
  ): Promise<Record<string, SetupExampleEntity[]>> => {
    if (filename === EMPTY_CONFIG_SENTINEL) {
      return {};
    }

    const document = await readExampleDocument(filename);
    const bridgeConfig = getBridgeConfig(document);
    if (!bridgeConfig) {
      return {};
    }

    // Generate ids for examples that omit them so the selection list is stable.
    try {
      normalizeConfig(bridgeConfig as unknown as HomenetBridgeConfig);
    } catch {
      // Ignore validation errors; the example can still be inspected.
    }

    const entities: Record<string, SetupExampleEntity[]> = {};
    for (const type of ENTITY_TYPE_KEYS) {
      const items = bridgeConfig[type];
      if (!Array.isArray(items) || items.length === 0) continue;

      entities[type] = items.filter(isRecord).map((item) => ({
        id: typeof item.id === 'string' ? item.id : undefined,
        name:
          typeof item.name === 'string'
            ? item.name
            : typeof item.id === 'string'
              ? item.id
              : undefined,
      }));
    }

    return entities;
  };

  let serialTestRunning = false;

  const testSerial = async (request: SetupSerialTestRequest): Promise<SetupSerialTestResult> => {
    if (serialTestRunning) {
      throw new ConfigItemsError('TEST_ALREADY_RUNNING', 'A serial test is already running.', 409);
    }

    serialTestRunning = true;

    try {
      const filename = typeof request.filename === 'string' ? request.filename : '';
      if (!filename || filename.includes('/') || filename.includes('\\')) {
        throw new ConfigItemsError('INVALID_FILENAME', 'Invalid example filename.', 400);
      }

      if (filename === EMPTY_CONFIG_SENTINEL) {
        const parsed = parseSerialConfigPayload(request.serialConfig);
        if (!parsed.serialConfig) {
          throw new ConfigItemsError(
            parsed.error ?? 'SERIAL_CONFIG_REQUIRED',
            'Invalid serial configuration.',
            400,
          );
        }

        const packets = await collectSerialPackets(parsed.serialConfig.path, parsed.serialConfig, {
          maxPackets: 10,
          timeoutMs: 3000,
        });

        return {
          ok: true,
          portId: normalizePortId(parsed.serialConfig.portId || 'raw', 0),
          packets,
        };
      }

      if (typeof request.serialPath !== 'string') {
        throw new ConfigItemsError('SERIAL_PATH_REQUIRED', 'serialPath is required.', 400);
      }

      const serialPathValidation = validateSerialPath(request.serialPath);
      if (serialPathValidation) {
        throw new ConfigItemsError(serialPathValidation.error, 'Invalid serial path.', 400);
      }

      const document = await readExampleDocument(filename);
      const serialPathValue = request.serialPath.trim();
      const portIdValue = typeof request.portId === 'string' ? request.portId.trim() : undefined;

      if (!applySerialPathToConfig(document, serialPathValue, portIdValue)) {
        throw new ConfigItemsError(
          'SERIAL_CONFIG_MISSING',
          `Example "${filename}" has no serial configuration.`,
          400,
        );
      }

      const bridgeConfig = getBridgeConfig(document);
      if (!bridgeConfig) {
        throw new ConfigItemsError(
          'SERIAL_CONFIG_MISSING',
          `Example "${filename}" has no serial configuration.`,
          400,
        );
      }

      const normalized = normalizeConfig(
        JSON.parse(JSON.stringify(bridgeConfig)) as HomenetBridgeConfig,
      );
      const serialConfigValue = extractSerialConfig(normalized);
      if (!serialConfigValue) {
        throw new ConfigItemsError(
          'SERIAL_CONFIG_MISSING',
          `Example "${filename}" has no serial configuration.`,
          400,
        );
      }

      const packets = await collectSerialPackets(serialPathValue, serialConfigValue, {
        maxPackets: 10,
        timeoutMs: 3000,
      });

      return {
        ok: true,
        portId: normalizePortId(serialConfigValue.portId || 'raw', 0),
        packets,
      };
    } catch (error) {
      if (error instanceof ConfigItemsError) {
        throw error;
      }

      logger.error({ err: error }, '[service] Failed to test serial path during setup');
      const err = error as Error & { code?: string };
      throw new ConfigItemsError(
        'SERIAL_TEST_FAILED',
        'Serial test failed.',
        500,
        err.code || err.message || 'Unknown error',
      );
    } finally {
      serialTestRunning = false;
    }
  };

  const applySetupSelection = async (request: SetupSelectionRequest): Promise<SetupApplyResult> => {
    const filename = typeof request.filename === 'string' ? request.filename : '';
    if (!filename || filename.includes('/') || filename.includes('\\')) {
      throw new ConfigItemsError('INVALID_FILENAME', 'Invalid example filename.', 400);
    }

    const isAddMode = request.mode === 'add';
    const targetFilename = isAddMode ? await getNextConfigFilename() : defaultConfigFilename;

    const targetPath = resolveSecurePath(configDir, targetFilename);
    if (!targetPath) {
      throw new ConfigItemsError(
        'INVALID_TARGET_FILENAME',
        'Invalid target configuration filename.',
        400,
      );
    }

    let updatedYaml = '';
    let serialPathValue = '';
    let effectivePortId: string | undefined;

    if (filename === EMPTY_CONFIG_SENTINEL) {
      const parsed = parseSerialConfigPayload(request.serialConfig);
      if (!parsed.serialConfig) {
        throw new ConfigItemsError(
          parsed.error ?? 'SERIAL_CONFIG_REQUIRED',
          'Invalid serial configuration.',
          400,
        );
      }

      serialPathValue = parsed.serialConfig.path;
      effectivePortId = normalizePortId(parsed.serialConfig.portId, 0);
      const emptyConfig = buildEmptyConfig(parsed.serialConfig, request.packetDefaults);
      updatedYaml = dumpConfigToYaml(emptyConfig, { lineWidth: 120 });
    } else {
      if (typeof request.serialPath !== 'string') {
        throw new ConfigItemsError('SERIAL_PATH_REQUIRED', 'serialPath is required.', 400);
      }

      const serialPathValidation = validateSerialPath(request.serialPath);
      if (serialPathValidation) {
        throw new ConfigItemsError(serialPathValidation.error, 'Invalid serial path.', 400);
      }

      const document = await readExampleDocument(filename);
      serialPathValue = request.serialPath.trim();
      const requestedPortId = typeof request.portId === 'string' ? request.portId.trim() : '';

      const bridgeConfig = getBridgeConfig(document);
      const bridgeSerial = bridgeConfig?.serial;
      const examplePortId =
        isRecord(bridgeSerial) && typeof bridgeSerial.portId === 'string'
          ? bridgeSerial.portId.trim()
          : '';
      effectivePortId = requestedPortId || examplePortId || 'default';

      if (bridgeConfig) {
        try {
          normalizeConfig(bridgeConfig as unknown as HomenetBridgeConfig);
        } catch {
          // Ignore validation errors; setup only rewrites serial settings and selection.
        }
      }

      if (
        !applySerialPathToConfig(
          document,
          serialPathValue,
          requestedPortId || undefined,
          request.packetDefaults,
        )
      ) {
        throw new ConfigItemsError(
          'SERIAL_CONFIG_MISSING',
          `Example "${filename}" has no serial configuration.`,
          400,
        );
      }

      if (bridgeConfig && isRecord(request.selectedEntities)) {
        for (const type of ENTITY_TYPE_KEYS) {
          if (!(type in request.selectedEntities)) continue;

          const rawAllowed = request.selectedEntities[type];
          const allowedIds = new Set(
            Array.isArray(rawAllowed)
              ? rawAllowed.filter((id): id is string => typeof id === 'string')
              : [],
          );

          const items = bridgeConfig[type];
          if (!Array.isArray(items)) continue;

          const filtered = items.filter(
            (item) => isRecord(item) && typeof item.id === 'string' && allowedIds.has(item.id),
          );

          if (filtered.length > 0) {
            bridgeConfig[type] = filtered;
          } else {
            delete bridgeConfig[type];
          }
        }
      }

      updatedYaml = dumpConfigToYaml(document as Record<string, unknown>, { lineWidth: 120 });
    }

    if (isAddMode) {
      const duplicate = await checkDuplicateSerial(serialPathValue, effectivePortId);
      if (duplicate) {
        throw new ConfigItemsError(duplicate.error, 'Serial path or port id is duplicated.', 400);
      }
    }

    await fs.mkdir(configDir, { recursive: true });

    if (!isAddMode && (await fileExists(targetPath))) {
      try {
        const existingContent = await fs.readFile(targetPath, 'utf-8');
        const existingConfig = yaml.load(existingContent);
        if (isRecord(existingConfig)) {
          const backupPath = await saveBackup(targetPath, existingConfig, 'init_overwrite');
          logger.info(`[service] Backed up existing config to ${path.basename(backupPath)}`);
        }
      } catch (error) {
        logger.warn({ err: error }, '[service] Failed to backup existing config during init');
      }
    }

    await fs.writeFile(targetPath, updatedYaml, 'utf-8');
    await fs.writeFile(configRestartFlag, 'restart', 'utf-8');

    if (!isAddMode && !(await fileExists(configInitMarker))) {
      await fs.writeFile(configInitMarker, new Date().toISOString(), 'utf-8');
      logger.info(
        '[service] Initialization complete, .initialized marker created from setup wizard',
      );
    }

    logger.info(
      { filename, targetPath, serialPath: serialPathValue, mode: request.mode ?? 'init' },
      '[service] Config seeded from setup wizard',
    );

    return {
      ok: true,
      target: targetFilename,
      restartScheduled: true,
      requiresManualConfigUpdate: envConfigFilesSource !== 'default',
    };
  };

  return {
    getInitializationState,
    listExampleConfigs,
    getDefaultConfigFilename,
    getNextConfigFilename,
    checkDuplicateSerial,
    getSetupOverview,
    getExampleSerialInfo,
    getExampleEntities,
    testSerial,
    applySetupSelection,
    deps,
    applySerialPathToConfig,
    parseSerialConfigPayload,
    buildEmptyConfig,
    extractSerialConfig,
    collectSerialPackets,
  };
};
