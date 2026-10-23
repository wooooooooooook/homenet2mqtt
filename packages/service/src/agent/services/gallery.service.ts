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
