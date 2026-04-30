import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setTimeZone,
  getTimeZone,
  withTimeZone,
  formatTime,
  formatRelativeTime,
} from './time';

describe('time utils', () => {
  beforeEach(() => {
    setTimeZone(undefined);
  });

  describe('setTimeZone / getTimeZone', () => {
    it('should set and get timezone', () => {
      setTimeZone('Asia/Seoul');
      expect(getTimeZone()).toBe('Asia/Seoul');
    });

    it('should trim whitespace', () => {
      setTimeZone('  Asia/Seoul  ');
      expect(getTimeZone()).toBe('Asia/Seoul');
    });

    it('should reset to undefined for null or empty string', () => {
      setTimeZone('Asia/Seoul');
      setTimeZone(null);
      expect(getTimeZone()).toBeUndefined();

      setTimeZone('Asia/Seoul');
      setTimeZone('');
      expect(getTimeZone()).toBeUndefined();

      setTimeZone('Asia/Seoul');
      setTimeZone('   ');
      expect(getTimeZone()).toBeUndefined();
    });
  });

  describe('withTimeZone', () => {
    it('should return options as is if timezone is not set', () => {
      const options = { hour: 'numeric' } as const;
      expect(withTimeZone(options)).toEqual(options);
    });

    it('should add timezone to options if set', () => {
      setTimeZone('Asia/Seoul');
      const options = { hour: 'numeric' } as const;
      expect(withTimeZone(options)).toEqual({ ...options, timeZone: 'Asia/Seoul' });
    });

    it('should return object with only timeZone if no options provided', () => {
      setTimeZone('UTC');
      expect(withTimeZone()).toEqual({ timeZone: 'UTC' });
    });
  });

  describe('formatTime', () => {
    const timestamp = new Date('2023-01-01T00:00:00Z').getTime();

    it('should format time correctly without timezone (default)', () => {
      const result = formatTime(timestamp, 'en-US');
      expect(typeof result).toBe('string');
    });

    it('should format time correctly with explicit timezone', () => {
      setTimeZone('Asia/Seoul');
      // 2023-01-01 00:00:00 UTC is 2023-01-01 09:00:00 KST
      const result = formatTime(timestamp, 'en-US', { hour12: false });
      expect(result).toContain('09:00:00');
    });

    it('should handle Date object input', () => {
      const date = new Date(timestamp);
      const result = formatTime(date, 'en-US');
      expect(typeof result).toBe('string');
    });

    it('should handle string input', () => {
      const result = formatTime('2023-01-01T00:00:00Z', 'en-US');
      expect(typeof result).toBe('string');
    });
  });

  describe('formatRelativeTime', () => {
    const originalDateNow = Date.now;
    const mockNow = new Date('2023-01-01T12:00:00Z').getTime();

    beforeEach(() => {
      global.Date.now = () => mockNow;
    });

    afterEach(() => {
      global.Date.now = originalDateNow;
    });

    it('should return less_than_a_minute for differences < 60s', () => {
      const timestamp = mockNow - 30000; // 30s ago
      expect(formatRelativeTime(timestamp)).toBe('less_than_a_minute');
    });

    it('should return minutes ago for differences < 1h', () => {
      const timestamp = mockNow - 5 * 60000; // 5m ago
      expect(formatRelativeTime(timestamp, 'en')).toBe('5 minutes ago');
      expect(formatRelativeTime(timestamp, 'ko')).toBe('5분 전');
    });

    it('should return hours ago for differences < 24h', () => {
      const timestamp = mockNow - 3 * 3600000; // 3h ago
      expect(formatRelativeTime(timestamp, 'en')).toBe('3 hours ago');
      expect(formatRelativeTime(timestamp, 'ko')).toBe('3시간 전');
    });

    it('should return days ago for differences < 7d', () => {
      const timestamp = mockNow - 2 * 86400000; // 2d ago
      expect(formatRelativeTime(timestamp, 'en')).toBe('2 days ago');
      expect(formatRelativeTime(timestamp, 'ko')).toBe('2일 전');
    });

    it('should fallback to absolute time for differences >= 7d', () => {
      const timestamp = mockNow - 8 * 86400000; // 8d ago
      setTimeZone('UTC');
      const result = formatRelativeTime(timestamp, 'en');
      // 2023-01-01 12:00:00 UTC minus 8 days is 2022-12-24 12:00:00 UTC
      expect(result).toMatch(/12:00/);
      expect(result).toMatch(/24/);
    });
  });
});
