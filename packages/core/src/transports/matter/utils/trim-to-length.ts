// packages/core/src/transports/matter/utils/trim-to-length.ts

/**
 * Trims a string to the specified maximum length.
 * If the string exceeds maxLength, it is truncated and the suffix is appended.
 */
export function trimToLength(
  value: string | undefined | null,
  maxLength: number,
  suffix = '...',
): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (value.length <= maxLength) {
    return value;
  }
  return value.substring(0, maxLength - suffix.length) + suffix;
}
