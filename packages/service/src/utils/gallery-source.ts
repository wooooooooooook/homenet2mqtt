/**
 * Gallery source resolution shared by the Agent API.
 * GitHub is authoritative (the point of gallery lookup is to reduce unmatched
 * packets with the latest presets), the packaged `gallery/` directory is the offline fallback.
 */

import fs from 'node:fs/promises';
import { logger } from '@rs485-homenet/core';
import { LOCAL_GALLERY_DIR } from './constants.js';
import { getGalleryListUrl, getGalleryRawBaseUrl, resolveSecurePath } from './helpers.js';
import { getFrontendSettings } from '../services/frontend-settings.service.js';
import type { DiscoverySchema } from '../services/discovery.service.js';

export type GallerySource = 'remote' | 'local';

export interface GalleryListParameter {
  name: string;
  type?: string;
  default?: unknown;
  min?: number;
  max?: number;
  label?: string;
  label_en?: string;
}

export interface GalleryListItem {
  file: string;
  name?: string;
  name_en?: string;
  description?: string;
  description_en?: string;
  version?: string;
  author?: string;
  tags?: string[];
  parameters?: GalleryListParameter[];
  content_summary?: {
    entities?: Record<string, number>;
    automations?: number;
    scripts?: number;
  };
  discovery?: DiscoverySchema;
}

export interface GalleryListVendorRequirements {
  serial?: Record<string, unknown>;
  packet_defaults?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GalleryListVendor {
  id: string;
  name?: string;
  requirements?: GalleryListVendorRequirements;
  items: GalleryListItem[];
}

export interface GalleryList {
  generated_at?: string;
  vendors: GalleryListVendor[];
}

const FETCH_TIMEOUT_MS = 8000;

export interface GalleryLookupResult<T> {
  value: T;
  source: GallerySource;
}

const fetchWithTimeout = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    logger.warn({ err: error, url }, '[gallery-source] Remote gallery fetch failed');
    return null;
  }
};

const readLocalFile = async (relativePath: string): Promise<string | null> => {
  const secure = resolveSecurePath(LOCAL_GALLERY_DIR, relativePath);
  if (!secure) return null;
  try {
    return await fs.readFile(secure, 'utf8');
  } catch (error) {
    logger.warn({ err: error, path: secure }, '[gallery-source] Local gallery read failed');
    return null;
  }
};

export async function readGalleryList(): Promise<GalleryLookupResult<GalleryList> | null> {
  const settings = getFrontendSettings().gallery;

  const remote = await fetchWithTimeout(getGalleryListUrl(settings));
  if (remote) {
    try {
      return { value: JSON.parse(remote) as GalleryList, source: 'remote' };
    } catch (error) {
      logger.warn({ err: error }, '[gallery-source] Remote gallery list is not valid JSON');
    }
  }

  const local = await readLocalFile('list_new.json');
  if (local) {
    try {
      return { value: JSON.parse(local) as GalleryList, source: 'local' };
    } catch (error) {
      logger.warn({ err: error }, '[gallery-source] Local gallery list is not valid JSON');
    }
  }

  return null;
}

export async function readGallerySnippet(
  relativePath: string,
): Promise<GalleryLookupResult<string> | null> {
  const remote = await fetchWithTimeout(
    `${getGalleryRawBaseUrl(getFrontendSettings().gallery)}/${relativePath}`,
  );
  if (remote) return { value: remote, source: 'remote' };

  const local = await readLocalFile(relativePath);
  if (local) return { value: local, source: 'local' };

  return null;
}
