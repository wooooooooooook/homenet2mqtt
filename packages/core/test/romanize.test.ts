import { describe, it, expect } from 'vitest';
import { romanize, toEntityId } from '../src/utils/romanize.js';

describe('Romanize Utility', () => {
  describe('romanize', () => {
    it('should return original text for non-string or empty input', () => {
      expect(romanize(null as any)).toBe(null);
      expect(romanize(undefined as any)).toBe(undefined);
      expect(romanize('')).toBe('');
    });

    it('should return original text if no Korean characters are present', () => {
      expect(romanize('Living Room')).toBe('Living Room');
      expect(romanize('Light 1')).toBe('Light 1');
      expect(romanize('12345')).toBe('12345');
      expect(romanize('!@#$%')).toBe('!@#$%');
    });

    it('should romanize Korean text using Revised Romanization', () => {
      // Common terms (Expectations based on Revised Romanization)
      expect(romanize('거실')).toBe('geosil');
      expect(romanize('안방')).toBe('anbang');
      expect(romanize('조명')).toBe('jomyeong');
    });

    it('should handle mixed Korean and non-Korean text', () => {
      expect(romanize('거실 Light')).toBe('geosil Light');
      expect(romanize('조명 1')).toBe('jomyeong 1');
    });
  });

  describe('toEntityId', () => {
    it('should return empty string for non-string or empty input', () => {
      expect(toEntityId(null as any)).toBe('');
      expect(toEntityId(undefined as any)).toBe('');
      expect(toEntityId('')).toBe('');
    });

    it('should convert Korean names to safe lowercase snake_case IDs', () => {
      expect(toEntityId('거실 조명')).toBe('geosil_jomyeong');
      expect(toEntityId('안방 에어컨')).toBe('anbang_eeokon');
    });

    it('should handle English names and spaces', () => {
      expect(toEntityId('Living Room Light')).toBe('living_room_light');
      expect(toEntityId('  Trim  Me  ')).toBe('trim_me');
    });

    it('should handle special characters and multiple spaces', () => {
      expect(toEntityId('Light #1! (Main)')).toBe('light_1_main');
      // Current implementation preserves dashes and does not collapse or trim them
      expect(toEntityId('---Multiple---Dashes---')).toBe('---multiple---dashes---');
      expect(toEntityId('___Multiple___Underscores___')).toBe('multiple_underscores');
    });

    it('should produce a lowercase ID', () => {
      expect(toEntityId('KOREAN Name')).toBe('korean_name');
    });

    it('should handle leading/trailing non-alphanumeric characters (except dashes)', () => {
      expect(toEntityId('!!거실!!')).toBe('geosil');
      expect(toEntityId('  _  거실  _  ')).toBe('geosil');
    });
  });
});
