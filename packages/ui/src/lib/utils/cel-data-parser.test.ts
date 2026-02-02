import { describe, it, expect } from 'vitest';
import { parseCelDataInput } from './cel-data-parser';

describe('parseCelDataInput', () => {
  it('should return undefined for empty input', () => {
    expect(parseCelDataInput('')).toBeUndefined();
    expect(parseCelDataInput('   ')).toBeUndefined();
  });

  describe('Array Format', () => {
    it('should parse standard JSON integer array', () => {
      expect(parseCelDataInput('[1, 2, 3]')).toEqual([1, 2, 3]);
    });

    it('should parse array with hex values', () => {
      expect(parseCelDataInput('[0x01, 0xFF, 10]')).toEqual([1, 255, 10]);
    });

    it('should throw INVALID_NUMBER_ARRAY for non-numbers in array', () => {
      expect(() => parseCelDataInput('[1, "a"]')).toThrow('INVALID_NUMBER_ARRAY');
    });

    it('should handle empty array', () => {
      expect(parseCelDataInput('[]')).toEqual([]);
    });
  });

  describe('Hex Stream Format', () => {
    it('should parse space-separated hex string', () => {
      // f7 -> 247, 55 -> 85
      expect(parseCelDataInput('f7 55')).toEqual([247, 85]);
    });

    it('should parse 0x prefixed hex string', () => {
      expect(parseCelDataInput('0xf7 0x55')).toEqual([247, 85]);
    });

    it('should parse mixed format (with/without 0x)', () => {
      expect(parseCelDataInput('f7 0x55 12')).toEqual([247, 85, 18]);
    });

    it('should treat digits as hex in stream mode', () => {
      // "10" in hex stream -> 0x10 = 16
      expect(parseCelDataInput('10 20')).toEqual([16, 32]);
    });

    it('should handle comma separation in stream mode', () => {
      expect(parseCelDataInput('f7, 55, 12')).toEqual([247, 85, 18]);
    });

    it('should throw INVALID_FORMAT for invalid hex', () => {
      expect(() => parseCelDataInput('gg hh')).toThrow('INVALID_FORMAT');
    });

    it('should throw INVALID_FORMAT for partial invalid input', () => {
      expect(() => parseCelDataInput('f7 zz')).toThrow('INVALID_FORMAT');
    });

    it('should throw INVALID_FORMAT for number followed by garbage', () => {
      expect(() => parseCelDataInput('10z')).toThrow('INVALID_FORMAT');
    });
  });
});
