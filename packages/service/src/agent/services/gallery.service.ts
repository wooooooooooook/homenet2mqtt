import yaml from 'js-yaml';
import { normalizePortId, type HomenetBridgeConfig } from '@rs485-homenet/core';
import { ConfigItemsError } from '../../services/config-items.service.js';
import type { LogRetentionService } from '../../log-retention.service.js';
import {
  evaluateDiscovery,
  prepareDiscoveryPackets,
  type DiscoverySchema,
} from '../../services/discovery.service.js';
import { checkConfigRequirements } from '../../utils/gallery-requirements.js';
import {
  readGalleryList,
  readGallerySnippet,
  type GalleryListItem,
  type GalleryListVendor,
  type GallerySource,
} from '../../utils/gallery-source.js';
import {
  expandGalleryTemplate,
  resolveGalleryParameters,
  type GallerySnippet,
} from '../../utils/gallery-template.js';
import {
  validateGalleryAutomationIds,
  validateGalleryEntityIds,
  validateGalleryScriptIds,
} from '../../utils/gallery-validation.js';
import { checkMinVersion, getAppVersion } from '../../utils/version-utils.js';

export interface AgentGalleryContext {
  getCurrentConfigs: () => HomenetBridgeConfig[];
  logRetentionService: LogRetentionService;
}

export interface GalleryVendorSummary {
  id: string;
  name?: string;
  requirements?: GalleryListVendor['requirements'];
  snippetCount: number;
  entityTypes: string[];
}

export interface GalleryVendorIndex {
  vendor: string;
  name?: string;
  requirements?: GalleryListVendor['requirements'];
  source: GallerySource;
  generatedAt?: string;
  snippets: Array<{
    file: string;
    name?: string;
    name_en?: string;
    description?: string;
    version?: string;
    tags?: string[];
    parameters?: GalleryListItem['parameters'];
    contentSummary?: GalleryListItem['content_summary'];
    discovery?: DiscoverySchema;
  }>;
}

const entityTypesOf = (items: GalleryListItem[]): string[] => {
  const types = new Set<string>();
  for (const item of items)
    for (const type of Object.keys(item.content_summary?.entities ?? {})) types.add(type);
  return [...types].sort();
};

const loadGalleryList = async () => {
  const lookup = await readGalleryList();
  if (!lookup || !Array.isArray(lookup.value.vendors)) {
    throw new ConfigItemsError(
      'GALLERY_UNAVAILABLE',
      'Gallery list could not be loaded from GitHub or the packaged gallery directory.',
      503,
    );
  }
  return lookup;
};

export async function listGalleryVendors(): Promise<{
  source: GallerySource;
  generatedAt?: string;
  vendors: GalleryVendorSummary[];
}> {
  const { value, source } = await loadGalleryList();
  return {
    source,
    generatedAt: value.generated_at,
    vendors: value.vendors.map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      requirements: vendor.requirements,
      snippetCount: vendor.items.length,
      entityTypes: entityTypesOf(vendor.items),
    })),
  };
}

export async function getGalleryVendorIndex(vendorId: string): Promise<GalleryVendorIndex> {
  const { value, source } = await loadGalleryList();
  const vendor = value.vendors.find((item) => item.id === vendorId);
  if (!vendor) {
    throw new ConfigItemsError(
      'GALLERY_VENDOR_NOT_FOUND',
      `Gallery vendor "${vendorId}" was not found.`,
      404,
      { available: value.vendors.map((item) => item.id) },
    );
  }

  return {
    vendor: vendor.id,
    name: vendor.name,
    requirements: vendor.requirements,
    source,
    generatedAt: value.generated_at,
    snippets: vendor.items.map((item) => ({
      file: item.file,
      name: item.name,
      name_en: item.name_en,
      description: item.description,
      version: item.version,
      tags: item.tags,
      parameters: item.parameters,
      contentSummary: item.content_summary,
      discovery: item.discovery,
    })),
  };
}

const assertGalleryFilePath = (file: string): string => {
  const normalized = file.replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.includes('..') ||
    !(normalized.endsWith('.yaml') || normalized.endsWith('.yml'))
  ) {
    throw new ConfigItemsError(
      'GALLERY_FILE_INVALID',
      'file must be a gallery-relative YAML path such as "commax/heaters_new.yaml".',
      400,
    );
  }
  return normalized;
};

export async function getGallerySnippet(file: string): Promise<{
  file: string;
  source: GallerySource;
  bytes: number;
  yaml: string;
}> {
  const normalized = assertGalleryFilePath(file);
  const lookup = await readGallerySnippet(normalized);
  if (!lookup) {
    throw new ConfigItemsError(
      'GALLERY_FILE_NOT_FOUND',
      `Gallery file "${normalized}" was not found.`,
      404,
    );
  }
  return {
    file: normalized,
    source: lookup.source,
    bytes: Buffer.byteLength(lookup.value, 'utf8'),
    yaml: lookup.value,
  };
}

export interface GalleryExpandOptions {
  file: string;
  parameterValues?: Record<string, unknown>;
}

export interface GalleryExpandResult {
  file: string;
  vendor: string;
  source: GallerySource;
  name?: string;
  nameEn?: string;
  version?: string;
  parameterValues: Record<string, unknown>;
  counts: {
    entities: number;
    automations: number;
    scripts: number;
  };
  draft: {
    entities: Record<string, unknown[]>;
    automations: unknown[];
    scripts: unknown[];
  };
}

const countExpandedEntities = (entities: Record<string, unknown> | undefined): number =>
  entities
    ? Object.values(entities).reduce<number>(
        (total, list) => total + (Array.isArray(list) ? list.length : 0),
        0,
      )
    : 0;

export async function expandGallerySnippet(
  options: GalleryExpandOptions,
): Promise<GalleryExpandResult> {
  if (typeof options.file !== 'string' || !options.file.trim()) {
    throw new ConfigItemsError(
      'GALLERY_FILE_INVALID',
      'file must be a gallery-relative YAML path such as "commax/heaters_new.yaml".',
      400,
    );
  }
  if (
    options.parameterValues !== undefined &&
    (!options.parameterValues ||
      typeof options.parameterValues !== 'object' ||
      Array.isArray(options.parameterValues))
  ) {
    throw new ConfigItemsError(
      'GALLERY_PARAMETER_INVALID',
      'parameterValues must be an object.',
      400,
    );
  }

  const file = assertGalleryFilePath(options.file);
  const lookup = await readGallerySnippet(file);
  if (!lookup) {
    throw new ConfigItemsError(
      'GALLERY_FILE_NOT_FOUND',
      `Gallery file "${file}" was not found.`,
      404,
    );
  }

  let snippet: GallerySnippet;
  try {
    const parsed = yaml.load(lookup.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Gallery YAML must be a mapping.');
    }
    snippet = parsed as GallerySnippet;
  } catch (error) {
    throw new ConfigItemsError(
      'GALLERY_YAML_INVALID',
      `Gallery file "${file}" is not valid YAML.`,
      400,
      { reason: error instanceof Error ? error.message : String(error) },
    );
  }

  const appVersion = await getAppVersion();
  const versionCheck = checkMinVersion(snippet.meta?.min_version, appVersion);
  if (!versionCheck.compatible) {
    throw new ConfigItemsError(
      'GALLERY_VERSION_INCOMPATIBLE',
      versionCheck.message ?? 'This snippet requires a newer service version.',
      400,
      { minVersion: versionCheck.minVersion, appVersion: versionCheck.appVersion },
    );
  }

  let parameterValues: Record<string, unknown>;
  let expanded: GallerySnippet;
  try {
    parameterValues = resolveGalleryParameters(snippet, options.parameterValues);
    expanded = expandGalleryTemplate(snippet, parameterValues);
  } catch (error) {
    throw new ConfigItemsError(
      'GALLERY_EXPAND_FAILED',
      error instanceof Error ? error.message : 'Gallery expansion failed.',
      400,
    );
  }

  const missing = [
    ...validateGalleryEntityIds(expanded.entities),
    ...validateGalleryAutomationIds(expanded.automation),
    ...validateGalleryScriptIds(expanded.scripts),
  ];
  if (missing.length > 0) {
    throw new ConfigItemsError(
      'GALLERY_CONTENT_INVALID',
      `Gallery items must include id. Missing: ${missing.join(', ')}`,
      400,
      { missing },
    );
  }

  const entities = (expanded.entities ?? {}) as Record<string, unknown[]>;
  const automations = Array.isArray(expanded.automation) ? expanded.automation : [];
  const scripts = Array.isArray(expanded.scripts) ? expanded.scripts : [];

  return {
    file,
    vendor: file.split('/')[0],
    source: lookup.source,
    name: snippet.meta?.name,
    nameEn: snippet.meta?.name_en,
    version: snippet.meta?.version,
    parameterValues,
    counts: {
      entities: countExpandedEntities(entities),
      automations: automations.length,
      scripts: scripts.length,
    },
    draft: { entities, automations, scripts },
  };
}

export interface GalleryMatchResult {
  file: string;
  vendor: string;
  name?: string;
  version?: string;
  matched: boolean;
  matchedPacketCount: number;
  parameterValues: Record<string, unknown>;
}

export interface GalleryMatchReport {
  available: boolean;
  reason?: string;
  portId?: string | null;
  source?: GallerySource;
  packetCount?: number;
  evaluatedCount?: number;
  results?: GalleryMatchResult[];
}

export async function matchGallerySnippets(
  ctx: AgentGalleryContext,
  options: { portId?: string; vendor?: string },
): Promise<GalleryMatchReport> {
  if (!ctx.logRetentionService.isEnabled()) {
    return {
      available: false,
      reason: 'Log retention is disabled, so observed packets cannot be scored.',
      portId: options.portId ?? null,
    };
  }

  const { value, source } = await loadGalleryList();
  const configs = ctx.getCurrentConfigs();
  const portId = options.portId;
  const configForPort = portId
    ? (configs.find(
        (config, index) =>
          config?.serial && normalizePortId(config.serial.portId, index) === portId,
      ) ?? null)
    : null;

  if (portId && !configForPort) {
    throw new ConfigItemsError(
      'GALLERY_PORT_NOT_FOUND',
      `No loaded configuration for portId "${portId}".`,
      404,
    );
  }

  const discoveryPackets = prepareDiscoveryPackets(
    ctx.logRetentionService.getPacketDictionary(portId),
    ctx.logRetentionService.getUnmatchedPackets(portId),
  );

  const results: GalleryMatchResult[] = [];
  let evaluatedCount = 0;

  for (const vendor of value.vendors) {
    if (options.vendor && vendor.id !== options.vendor) continue;

    // A vendor's presets only make sense when an active bridge matches its framing.
    const requirements = vendor.requirements;
    if (requirements) {
      const compatible = portId
        ? configForPort !== null && checkConfigRequirements(configForPort, requirements)
        : configs.some((config) => checkConfigRequirements(config, requirements));
      if (!compatible) continue;
    }

    const defaultOffset = Array.isArray(requirements?.packet_defaults?.rx_header)
      ? (requirements.packet_defaults.rx_header as unknown[]).length
      : 0;

    for (const item of vendor.items) {
      if (!item.discovery) continue;
      evaluatedCount += 1;
      const result = evaluateDiscovery(item.discovery, discoveryPackets, defaultOffset);
      results.push({
        file: item.file,
        vendor: vendor.id,
        name: item.name_en ?? item.name,
        version: item.version,
        matched: result.matched,
        matchedPacketCount: result.matchedPacketCount,
        parameterValues: result.parameterValues,
      });
    }
  }

  if (options.vendor && results.length === 0) {
    throw new ConfigItemsError(
      'GALLERY_VENDOR_NOT_FOUND',
      `Gallery vendor "${options.vendor}" has no scorable snippets.`,
      404,
    );
  }

  results.sort(
    (a, b) =>
      Number(b.matched) - Number(a.matched) ||
      b.matchedPacketCount - a.matchedPacketCount ||
      a.file.localeCompare(b.file),
  );

  return {
    available: true,
    portId: portId ?? null,
    source,
    packetCount: discoveryPackets.length,
    evaluatedCount,
    results,
  };
}
