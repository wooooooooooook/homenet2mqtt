/**
 * Romanization utility for Korean Hangul
 *
 * Converts Korean text to Romanized form using Revised Romanization (RR) system.
 * This is used to generate readable entity IDs from Korean names.
 */

import Aromanize from 'aromanize';

/**
 * Romanizes Korean Hangul text to Latin characters.
 * Non-Korean characters are passed through unchanged.
 *
 * @param text - The text to romanize
 * @returns Romanized text suitable for use in entity IDs
 *
 * @example
 * romanize('거실 조명') // 'geosil jomyeong'
 * romanize('안방') // 'anbang'
 * romanize('Light 1') // 'Light 1' (unchanged)
 * romanize('조명 1') // 'jomyeong 1'
 */
export function romanize(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Check if text contains Korean characters
  const hasKorean = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text);

  if (!hasKorean) {
    return text;
  }

  try {
    // Use Revised Romanization (RR) system
    return Aromanize.romanize(text, 'rr-translit');
  } catch {
    // Fallback: return original text if romanization fails
    return text;
  }
}

/**
 * Converts text to a safe entity ID format.
 * Combines romanization with normalization to create valid IDs.
 *
 * @param text - The text to convert
 * @returns A safe, lowercase snake_case ID
 *
 * @example
 * toEntityId('거실 조명') // 'geosil_jomyeong'
 * toEntityId('Light 1') // 'light_1'
 * toEntityId('안방 에어컨') // 'anbang_eeokon'
 */
export function toEntityId(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const romanized = romanize(text.trim());

  return romanized
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}
