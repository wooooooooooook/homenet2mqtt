import { describe, expect, it } from 'vitest';
import { calculateChecksum2, verifyChecksum2FromBuffer } from '../src/protocol/utils/checksum';

describe('CRC-16 variants', () => {
  const data = Array.from(Buffer.from('123456789', 'ascii'));
  const header = [0xaa, 0x55];

  it('should support legacy alias crc_ccitt_xmodem', () => {
    const legacy = calculateChecksum2(header, data, 'crc_ccitt_xmodem');
    const modern = calculateChecksum2(header, data, 'crc16_xmodem_no_header');
    expect(legacy).toEqual(modern);
    expect(modern).toEqual([0x31, 0xc3]);
  });

  it('should include header by default and exclude with _no_header suffix', () => {
    const withHeader = calculateChecksum2(header, data, 'crc16_xmodem');
    const withoutHeader = calculateChecksum2(header, data, 'crc16_xmodem_no_header');
    expect(withHeader).not.toEqual(withoutHeader);
    expect(withoutHeader).toEqual([0x31, 0xc3]);
  });

  it('should calculate crc16_ccitt_false correctly', () => {
    expect(calculateChecksum2([], data, 'crc16_ccitt_false')).toEqual([0x29, 0xb1]);
  });

  it('should calculate crc16_modbus correctly', () => {
    expect(calculateChecksum2([], data, 'crc16_modbus')).toEqual([0x4b, 0x37]);
  });

  it('should calculate crc16_ibm correctly', () => {
    expect(calculateChecksum2([], data, 'crc16_ibm')).toEqual([0xbb, 0x3d]);
  });

  it('should calculate crc16_kermit correctly', () => {
    expect(calculateChecksum2([], data, 'crc16_kermit')).toEqual([0x21, 0x89]);
  });

  it('should calculate crc16_x25 correctly', () => {
    expect(calculateChecksum2([], data, 'crc16_x25')).toEqual([0x90, 0x6e]);
  });

  it('should verify crc16_modbus from buffer', () => {
    const headerPart = [0xaa, 0xbb];
    const payload = Buffer.from([...headerPart, ...data]);
    const [high, low] = calculateChecksum2(headerPart, data, 'crc16_modbus');
    const packet = Buffer.from([...payload, high, low]);

    const ok = verifyChecksum2FromBuffer(
      packet,
      'crc16_modbus',
      2,
      packet.length - 2,
      0,
      high,
      low,
    );
    expect(ok).toBe(true);
  });

  it('should verify crc16_modbus_no_header from buffer', () => {
    const payload = Buffer.from([0xaa, 0xbb, ...data]);
    const [high, low] = calculateChecksum2([], data, 'crc16_modbus_no_header');
    const packet = Buffer.from([...payload, high, low]);

    const ok = verifyChecksum2FromBuffer(
      packet,
      'crc16_modbus_no_header',
      2,
      packet.length - 2,
      0,
      high,
      low,
    );
    expect(ok).toBe(true);
  });
});
