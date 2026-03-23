import { describe, expect, it } from 'vitest';
import {
  calculateChecksum,
  calculateChecksumFromBuffer,
  getChecksumOffsetType,
} from '../src/protocol/utils/checksum';

describe('CRC-8 variants', () => {
  const data = Array.from(Buffer.from('123456789', 'ascii'));
  const header = [0xaa, 0x55];

  it('should calculate crc8 variants with known vectors', () => {
    expect(calculateChecksum([], data, 'crc8')).toBe(0xf4);
    expect(calculateChecksum([], data, 'crc8_maxim')).toBe(0xa1);
    expect(calculateChecksum([], data, 'crc8_rohc')).toBe(0xd0);
    expect(calculateChecksum([], data, 'crc8_wcdma')).toBe(0x25);
  });

  it('should support _no_header suffix behavior', () => {
    const withHeader = calculateChecksum(header, data, 'crc8');
    const withoutHeader = calculateChecksum(header, data, 'crc8_no_header');
    expect(withHeader).not.toBe(withoutHeader);
    expect(withoutHeader).toBe(0xf4);
  });

  it('should verify offset behavior via calculateChecksumFromBuffer', () => {
    const payload = Buffer.from([...header, ...data]);
    const expected = calculateChecksum(header, data, 'crc8_maxim');
    const fromBuffer = calculateChecksumFromBuffer(
      payload,
      'crc8_maxim',
      header.length,
      payload.length,
    );
    expect(fromBuffer).toBe(expected);
  });

  it('should mark _no_header variants with header offset', () => {
    expect(getChecksumOffsetType('crc8')).toBe('base');
    expect(getChecksumOffsetType('crc8_no_header')).toBe('header');
    expect(getChecksumOffsetType('crc8_rohc_no_header')).toBe('header');
  });
});
