import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveSecurePath } from '../src/utils/helpers.js';

describe('Security Audit - Path Traversal', () => {
  const baseDir = path.resolve('/app/config');

  it('should block filenames that attempt to escape baseDir even if they match expected extension', () => {
    const maliciousFiles = [
      '../../../etc/passwd.homenet_bridge.yaml',
      '..\\..\\..\\etc\\passwd.homenet_bridge.yaml',
      './../../../etc/passwd.homenet_bridge.yaml',
      '/etc/passwd.homenet_bridge.yaml',
    ];

    for (const file of maliciousFiles) {
      const result = resolveSecurePath(baseDir, file);
      expect(result, `Failed to block ${file}`).toBeNull();
    }
  });

  it('should allow valid filenames', () => {
    const validFiles = [
      'default.homenet_bridge.yaml',
      'living_room.homenet_bridge.yml',
      'subdir/my.homenet_bridge.yaml',
    ];

    for (const file of validFiles) {
      const result = resolveSecurePath(baseDir, file);
      expect(result).not.toBeNull();
      expect(result).toBe(path.resolve(baseDir, file));
    }
  });

  it('should specifically test the weak regex scenario from the issue description', () => {
    // Rationale: A payload like ../../../etc/passwd.homenet_bridge.yaml might be possible if the regex doesn't anchor the start.
    const filename = '../../../etc/passwd.homenet_bridge.yaml';

    // Simulating what happened in config-editor.routes.ts before the fix
    const isValidConfigFilenameWeak = (f: string) => /\.homenet_bridge\.ya?ml$/.test(f);

    // The weak regex indeed passes
    expect(isValidConfigFilenameWeak(filename)).toBe(true);

    // But resolveSecurePath should block it
    expect(resolveSecurePath(baseDir, filename)).toBeNull();
  });
});
