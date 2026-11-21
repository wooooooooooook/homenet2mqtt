import { describe, it, expect } from 'vitest';
import { CelExecutor } from '../src/protocol/cel-executor.js';

describe('CelExecutor', () => {
  const executor = new CelExecutor();

  it('should evaluate simple arithmetic', () => {
    const result = executor.execute('1 + 2', {});
    expect(result).toBe(3);
  });

  it('should evaluate expression with input x', () => {
    // x is passed as BigInt internally, but input can be number
    const result = executor.execute('x * 2', { x: 10 });
    expect(result).toBe(20);
  });

  it('should evaluate expression with packet data', () => {
    // data[1] == 0x02 ? "Auto" : ...
    const packet = [0xf0, 0x02, 0x00];
    const script = 'data[1] == 0x02 ? "Auto" : "Manual"';
    const result = executor.execute(script, { data: packet });
    expect(result).toBe('Auto');
  });

  it('should handle bcd_to_int helper', () => {
    // bcd_to_int(0x12) -> 12
    const result = executor.execute('bcd_to_int(0x12)', {});
    expect(result).toBe(12);
  });

  it('should handle int_to_bcd helper', () => {
    // int_to_bcd(12) -> 0x12 (18)
    const result = executor.execute('int_to_bcd(12)', {});
    expect(result).toBe(0x12);
  });

  it('should handle array return values', () => {
    const script = '[[0x04, int_to_bcd(x)], [0x84, 0x00]]';
    const result = executor.execute(script, { x: 12 });
    expect(result).toEqual([
      [0x04, 0x12],
      [0x84, 0x00],
    ]);
  });

  it('should handle bitwise operations (custom functions)', () => {
    // bitAnd(0x0F, 0x03) -> 0x03
    expect(executor.execute('bitAnd(15, 3)', {})).toBe(3);
    // bitOr(0x01, 0x02) -> 0x03
    expect(executor.execute('bitOr(1, 2)', {})).toBe(3);
    // bitShiftLeft(1, 2) -> 4
    expect(executor.execute('bitShiftLeft(1, 2)', {})).toBe(4);
  });

  it('should handle len helper for list and string', () => {
    expect(executor.execute('len(data)', { data: [1, 2, 3] })).toBe(3);
    expect(executor.execute('len("abc")', {})).toBe(3);
  });

  it('should handle state value calculation (Commax example)', () => {
    // double((bcd_to_int(data[4]) * 10000) + (bcd_to_int(data[5]) * 100) + bcd_to_int(data[6])) * 0.1
    // data: [..., ..., ..., ..., 0x12, 0x34, 0x56] -> 12345.6
    const data = [0, 0, 0, 0, 0x12, 0x34, 0x56];
    const script =
      'double((bcd_to_int(data[4]) * 10000) + (bcd_to_int(data[5]) * 100) + bcd_to_int(data[6])) * 0.1';

    // In JS: (12*10000 + 34*100 + 56) * 0.1 = 12345.6
    const result = executor.execute(script, { data });
    expect(result).toBeCloseTo(12345.6);
  });

  it('should handle missing x gracefully', () => {
    // Should default to 0
    const result = executor.execute('x', {});
    expect(result).toBe(0);
  });

  it('should handle string x value for custom mode comparison', () => {
    const script = 'xstr == "Turbo" ? [0x20, 0x11, 0x03] : [0x00]';
    const result = executor.execute(script, { x: 'Turbo' });
    expect(result).toEqual([0x20, 0x11, 0x03]);
  });

  it('should return alternative array when string x does not match', () => {
    const script = 'xstr == "Turbo" ? [0x20, 0x11, 0x03] : [0x20, 0x11, 0x01]';
    const result = executor.execute(script, { x: 'Sleep' });
    expect(result).toEqual([0x20, 0x11, 0x01]);
  });

  describe('dyn x support for integer and floating-point inputs', () => {
    it('should correctly handle various numeric inputs (14, 14.0, 14.1, 14.5, 14.9, -14.5, 0.5)', () => {
      // 14 and 14.0 are integer inputs (Number.isInteger returns true) -> passed as BigInt
      expect(executor.execute('x', { x: 14 })).toBe(14);
      expect(executor.execute('x == 14', { x: 14 })).toBe(true);
      expect(executor.execute('x', { x: 14.0 })).toBe(14);
      expect(executor.execute('x == 14', { x: 14.0 })).toBe(true);

      // Floats -> passed as double
      expect(executor.execute('x', { x: 14.1 })).toBeCloseTo(14.1);
      expect(executor.execute('x', { x: 14.5 })).toBe(14.5);
      expect(executor.execute('x', { x: 14.9 })).toBeCloseTo(14.9);
      expect(executor.execute('x', { x: -14.5 })).toBe(-14.5);
      expect(executor.execute('x', { x: 0.5 })).toBe(0.5);

      // Fractional part calculation via double(x) - double(int(x))
      const fracScript = 'double(x) - double(int(x))';
      expect(executor.execute(fracScript, { x: 14 })).toBe(0);
      expect(executor.execute(fracScript, { x: 14.0 })).toBe(0);
      expect(executor.execute(fracScript, { x: 14.1 })).toBeCloseTo(0.1);
      expect(executor.execute(fracScript, { x: 14.5 })).toBeCloseTo(0.5);
      expect(executor.execute(fracScript, { x: 14.9 })).toBeCloseTo(0.9);
      expect(executor.execute(fracScript, { x: -14.5 })).toBeCloseTo(-0.5);
      expect(executor.execute(fracScript, { x: 0.5 })).toBeCloseTo(0.5);
    });

    it('should preserve backward compatibility for integer CEL operations', () => {
      // Bitwise operations with integer x
      expect(executor.execute('bitAnd(x, 0x0F)', { x: 0x1f })).toBe(0x0f);
      expect(executor.execute('bitOr(x, 0x80)', { x: 0x0e })).toBe(0x8e);
      expect(executor.execute('bitXor(x, 0xFF)', { x: 0xaa })).toBe(0x55);
      expect(executor.execute('bitNot(x)', { x: 0 })).toBe(-1);

      // Bitwise shifts with integer x
      expect(executor.execute('bitShiftLeft(x, 2)', { x: 3 })).toBe(12);
      expect(executor.execute('bitShiftRight(x, 1)', { x: 16 })).toBe(8);

      // Integer comparisons
      expect(executor.execute('x == 14', { x: 14 })).toBe(true);
      expect(executor.execute('x > 10 && x < 20', { x: 15 })).toBe(true);
      expect(executor.execute('x <= 14', { x: 14 })).toBe(true);

      // Explicit type conversions from int
      expect(executor.execute('double(x) + 0.5', { x: 14 })).toBe(14.5);
      expect(executor.execute('string(x)', { x: 14 })).toBe('14');
    });

    it('should correctly execute real-world vendor preset expressions with integer x', () => {
      // Commax pattern
      const commax =
        '[[0x20, 0x01, 0x11, 0x01, 0x00, 0x00, x], [0x20, 0x01, 0x11, 0x81, 0x00, 0x00, x]]';
      expect(executor.execute(commax, { x: 23 })).toEqual([
        [0x20, 0x01, 0x11, 0x01, 0x00, 0x00, 23],
        [0x20, 0x01, 0x11, 0x81, 0x00, 0x00, 23],
      ]);

      // Kocom pattern
      const kocom =
        '[[0x30, 0xbc, 0x00, 0x36, 0x03, 0x01, 0x00, 0x00, 0x11, 0x01, x, 0x00, 0x00, 0x00, 0x00, 0x00], [0x30, 0xdc]]';
      expect(executor.execute(kocom, { x: 22 })).toEqual([
        [
          0x30, 0xbc, 0x00, 0x36, 0x03, 0x01, 0x00, 0x00, 0x11, 0x01, 22, 0x00, 0x00, 0x00, 0x00,
          0x00,
        ],
        [0x30, 0xdc],
      ]);

      // Samsung HVAC pattern (arithmetic: x * 10)
      const samsungHvac =
        '[[0x55, 0xd0, 0x00, 0x20, 0x00, 0x02, 0x01, 0x80, x * 10], [0x55, 0xd0, 0x00, 0x20, 0x00, 0x02, 0x01, 0x00]]';
      expect(executor.execute(samsungHvac, { x: 26 })).toEqual([
        [0x55, 0xd0, 0x00, 0x20, 0x00, 0x02, 0x01, 0x80, 260],
        [0x55, 0xd0, 0x00, 0x20, 0x00, 0x02, 0x01, 0x00],
      ]);
    });

    it('should evaluate 0.5 step Ezville temperature command expression', () => {
      const ezvilleScript =
        '[[0x36, 0x11, 0x44, 0x01, bitOr(int(x), (double(x) - double(int(x)) >= 0.5 ? 0x80 : 0))], [0x36, 0x11, 0xc4]]';

      // 14.5℃ -> 0x8E (142)
      const resHalf = executor.execute(ezvilleScript, { x: 14.5 });
      expect(resHalf).toEqual([
        [0x36, 0x11, 0x44, 0x01, 0x8e],
        [0x36, 0x11, 0xc4],
      ]);

      // 14.0℃ / 14℃ -> 0x0E (14)
      const resInt = executor.execute(ezvilleScript, { x: 14 });
      expect(resInt).toEqual([
        [0x36, 0x11, 0x44, 0x01, 0x0e],
        [0x36, 0x11, 0xc4],
      ]);

      const resFloatZero = executor.execute(ezvilleScript, { x: 14.0 });
      expect(resFloatZero).toEqual([
        [0x36, 0x11, 0x44, 0x01, 0x0e],
        [0x36, 0x11, 0xc4],
      ]);
    });
  });
});
