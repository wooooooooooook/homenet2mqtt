import { describe, it, expect } from 'vitest';
import { PacketParser } from '../../src/protocol/packet-parser.js';
import { Buffer } from 'buffer';

describe('PacketParser Checksum Sweep Optimization Performance', () => {
  it('measures performance of checksum sweep scanning with valid headers (Noisy)', () => {
    // Protocol with No Fixed Length, No Footer, Add Checksum, Valid Header 0xAA
    // This triggers Strategy C (Checksum Sweep)
    const parser = new PacketParser({
      rx_checksum: 'add',
      rx_valid_headers: [0xaa],
    });

    const size = 10000; // Within MAX_BUFFER_SIZE (16384) to avoid truncation
    const buf = Buffer.alloc(size);

    // Fill with noise (random bytes, NO 0xAA)
    for (let i = 0; i < size; i++) {
      buf[i] = (i % 100) + 1; // 1..100. Never 0xAA (170).
    }

    // Insert valid packets every 100 bytes. Length 10.
    const packetLen = 10;
    let packetCount = 0;
    for (let i = 0; i < size - packetLen; i += 100) {
      buf[i] = 0xaa; // Valid Header

      // Calculate checksum (add)
      // Packet: [Header, Data..., Checksum]
      // Checksum is at i + packetLen - 1
      // Sum includes header (unless no_header, but 'add' includes header)
      let sum = 0;
      for (let j = 0; j < packetLen - 1; j++) {
        sum += buf[i + j];
      }
      buf[i + packetLen - 1] = sum & 0xff;

      packetCount++;
    }

    const start = process.hrtime.bigint();
    let totalPackets = 0;
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      // Reset parser state
      // @ts-ignore
      parser.resetBuffer();
      totalPackets += parser.parseChunk(buf).length;
    }
    const end = process.hrtime.bigint();

    const elapsedMs = Number(end - start) / 1e6;
    console.log(
      `[ChecksumSweep+ValidHeader] Parsed ${totalPackets} packets in ${elapsedMs.toFixed(2)} ms from ${size * iterations} bytes`,
    );

    expect(totalPackets).toBe(packetCount * iterations);
  });
});
