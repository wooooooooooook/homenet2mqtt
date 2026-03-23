import { describe, expect, it } from 'vitest';
import { CelExecutor } from '../src/protocol/cel-executor.js';

describe('CEL Custom CRC variants', () => {
  const cel = CelExecutor.shared();
  const data = Array.from(Buffer.from('123456789', 'ascii'));
  const header = [0xaa, 0x55];
  const payload = [...header, ...data];

  it('evaluates crc8 via CEL with parameters', () => {
    // CRC8 standard parameters
    const script = 'crc8(data, 0x07, 0x00, false, false, 0x00)';
    const result = cel.execute(script, { data: payload, len: payload.length });
    expect(result).toBe(0x6d); // CRC of 0xaa 0x55 123456789 with standard crc8 is 0x6d
  });

  it('evaluates crc8 w/o header via CEL and header_len', () => {
    // CRC8 standard parameters, no header
    const script = 'crc8_no_header(data, header_len, 0x07, 0x00, false, false, 0x00)';
    const result = cel.execute(script, { data: payload, len: payload.length, header_len: 2 });
    expect(result).toBe(0xf4); // CRC of 123456789 (which is the data without 2 bytes header) is 0xf4
  });

  it('evaluates crc16 via CEL with parameters', () => {
    // CRC16 CCITT False parameters
    const script = 'crc16_no_header(data, header_len, 0x1021, 0xFFFF, false, false, 0x0000)';
    const result = cel.execute(script, { data: payload, len: payload.length, header_len: 2 });
    expect(result).toEqual([0x29, 0xb1]); // CRC of '123456789' is 0x29B1
  });
});
