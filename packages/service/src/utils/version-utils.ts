import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '@rs485-homenet/core';

let cachedAppVersion: string | null = null;

export const getAppVersion = async (): Promise<string> => {
  if (cachedAppVersion) return cachedAppVersion;
  try {
    // Try root package.json (assuming CWD is project root)
    const rootPkgPath = path.resolve(process.cwd(), 'package.json');
    const content = await fs.readFile(rootPkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    cachedAppVersion = pkg.version || '0.0.0';
  } catch (e) {
    logger.warn('[version] Failed to read root package.json, falling back to 0.0.0');
    cachedAppVersion = '0.0.0';
  }
  return cachedAppVersion!;
};

/**
 * Compare two semver version strings.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((p) => parseInt(p, 10) || 0);
  const partsB = b.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

/**
 * Check if app version meets the minimum required version.
 * Returns compatible: true/false and message.
 */
export function checkMinVersion(
  minVersion: string | undefined,
  appVersion: string,
): { compatible: boolean; minVersion?: string; appVersion: string; message?: string } {
  if (!minVersion) {
    return { compatible: true, appVersion };
  }

  if (compareVersions(appVersion, minVersion) < 0) {
    return {
      compatible: false,
      minVersion,
      appVersion,
      message: `This snippet requires version ${minVersion} or higher. Please update your addon to use this feature.`,
    };
  }

  return { compatible: true, minVersion, appVersion };
}
