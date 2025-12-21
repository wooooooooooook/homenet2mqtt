import { StateSchema } from '../protocol/types.js';

export function matchesPacket(match: StateSchema, packet: number[]): boolean {
  if (!match.data || !Array.isArray(match.data)) return false;
  const offset = match.offset ?? 0;
  let matched = true;
  for (let i = 0; i < match.data.length; i++) {
    const expected = match.data[i];
    const packetByte = packet[offset + i];
    if (packetByte === undefined) {
      matched = false;
      break;
    }
    const mask = Array.isArray(match.mask) ? match.mask[i] : match.mask;
    const maskedPacket = mask !== undefined ? packetByte & mask : packetByte;
    const maskedExpected = mask !== undefined ? expected & mask : expected;
    if (maskedPacket !== maskedExpected) {
      matched = false;
      break;
    }
  }
  return match.inverted ? !matched : matched;
}
