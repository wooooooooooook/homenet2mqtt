import { describe, it, expect } from 'vitest';
import { PacketParser } from '../src/protocol/packet-parser.js';
import { PacketDefaults } from '../src/protocol/types.js';

describe('PacketParser Premature Matching', () => {
  it('should NOT match a single byte packet when it is just the header', () => {
    const defaults: PacketDefaults = {
      rx_header: [0xb0],
      rx_checksum: 'samsung_rx',
      rx_timeout: 10,
    };

    const parser = new PacketParser(defaults);

    // Feed just the header byte
    const packet = parser.parse(0xb0);

    // Should be null because a packet must contain more than just the header if checksum is involved
    // (or at least we expect it to wait for more data)
    expect(packet).toBeNull();
  });

  it('should match a valid minimal packet', () => {
    const defaults: PacketDefaults = {
      rx_header: [0xb0],
      rx_checksum: 'samsung_rx',
      rx_timeout: 10,
    };

    const parser = new PacketParser(defaults);

    expect(parser.parse(0xb0)).toBeNull();
    expect(parser.parse(0x41)).toBeNull();
    expect(parser.parse(0x00)).toBeNull();
    const packet = parser.parse(0x71);

    expect(packet).toEqual(Buffer.from([0xb0, 0x41, 0x00, 0x71]));
  });
});
