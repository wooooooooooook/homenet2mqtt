import { normalizePortId, type HomenetBridgeConfig } from '@rs485-homenet/core';
import { ConfigItemsError } from '../../services/config-items.service.js';
import type {
  SetupApplyResult,
  SetupExampleEntity,
  SetupExampleSerialInfo,
  SetupSerialTestResult,
  SetupWizardService,
} from '../../services/setup.service.js';

export interface AgentSetupContext {
  getCurrentConfigs: () => HomenetBridgeConfig[];
  setupWizardService: SetupWizardService;
}

export interface AgentSetupState {
  setupRequired: boolean;
  loadedConfigCount: number;
  loadedPortIds: string[];
  configRoot: string;
  examples: string[];
  defaultConfigName: string | null;
  hasDefaultConfig: boolean;
  hasInitMarker: boolean;
  requiresInitialization: boolean;
  hasCustomConfig: boolean;
  configFiles: string[];
}

export interface AgentSetupExample {
  filename: string;
  serial: SetupExampleSerialInfo['serial'];
  packetDefaults: SetupExampleSerialInfo['packetDefaults'];
  entities: Record<string, SetupExampleEntity[]>;
}

const assertSetupMode = (mode: 'init' | 'add', loadedConfigCount: number): void => {
  if (mode !== 'add' && loadedConfigCount > 0) {
    throw new ConfigItemsError(
      'SETUP_NOT_REQUIRED',
      'Configuration is already loaded. Use mode="add" with a unique portId to add another bridge.',
      409,
    );
  }
};

const readMode = (request: Record<string, unknown>): 'init' | 'add' =>
  request.mode === 'add' ? 'add' : 'init';

const readExample = (request: Record<string, unknown>): string => {
  const value = request.example;
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConfigItemsError(
      'EXAMPLE_REQUIRED',
      'example must be an example filename or "__empty__".',
      400,
    );
  }
  return value.trim();
};

const readString = (request: Record<string, unknown>, key: string): string | undefined => {
  const value = request[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export async function getAgentSetupState(ctx: AgentSetupContext): Promise<AgentSetupState> {
  const overview = await ctx.setupWizardService.getSetupOverview();
  const loadedConfigs = ctx.getCurrentConfigs();
  const loadedConfigCount = loadedConfigs.length;
  const loadedPortIds = loadedConfigs.map((config, index) =>
    normalizePortId(config?.serial?.portId, index),
  );

  return {
    setupRequired: loadedConfigCount === 0,
    loadedConfigCount,
    loadedPortIds,
    ...overview,
  };
}

export async function getAgentSetupExample(
  ctx: AgentSetupContext,
  filename: string,
): Promise<AgentSetupExample> {
  const [serialInfo, entities] = await Promise.all([
    ctx.setupWizardService.getExampleSerialInfo(filename),
    ctx.setupWizardService.getExampleEntities(filename),
  ]);

  return { filename, ...serialInfo, entities };
}

export async function testAgentSetupSerial(
  ctx: AgentSetupContext,
  request: Record<string, unknown>,
): Promise<SetupSerialTestResult> {
  return ctx.setupWizardService.testSerial({
    filename: readExample(request),
    serialPath: readString(request, 'serialPath'),
    serialConfig: request.serialConfig,
    portId: readString(request, 'portId'),
  });
}

export async function applyAgentInitialSetup(
  ctx: AgentSetupContext,
  request: Record<string, unknown>,
): Promise<SetupApplyResult> {
  const mode = readMode(request);
  assertSetupMode(mode, ctx.getCurrentConfigs().length);

  return ctx.setupWizardService.applySetupSelection({
    filename: readExample(request),
    mode,
    serialPath: readString(request, 'serialPath'),
    serialConfig: request.serialConfig,
    portId: readString(request, 'portId'),
    packetDefaults:
      request.packetDefaults &&
      typeof request.packetDefaults === 'object' &&
      !Array.isArray(request.packetDefaults)
        ? (request.packetDefaults as Record<string, unknown>)
        : undefined,
    selectedEntities:
      request.selectedEntities &&
      typeof request.selectedEntities === 'object' &&
      !Array.isArray(request.selectedEntities)
        ? (request.selectedEntities as Record<string, unknown>)
        : undefined,
  });
}
