// packages/core/src/protocol/utils/common.ts

import { ChecksumType } from '../types.js'; // Need to import ChecksumType

// Utility to convert hex string to byte array
export function hexToBytes(hex: string): number[] {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
}

// Utility to convert byte array to hex string
export function bytesToHex(bytes: number[]): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// --- Checksum Calculation Logic ---
export function calculateChecksum(
    data: number[],
    checksumType: ChecksumType | { type: 'custom'; algorithm: string },
    header: number[] = [],
    footer: number[] = [],
): number[] {
    if (typeof checksumType === 'object' && checksumType.type === 'custom') {
      console.warn(`Custom checksum algorithm '${checksumType.algorithm}' not yet implemented.`);
      return [];
    }

    let checksum = 0;
    let bytesToChecksum: number[] = [];

    switch (checksumType) {
      case 'add':
        bytesToChecksum = [...header, ...data, ...footer];
        let sum = 0;
        for (const byte of bytesToChecksum) {
          sum = (sum + byte) & 0xff;
        }
        checksum = -sum & 0xff;
        break;
      case 'xor':
        bytesToChecksum = [...header, ...data, ...footer];
        for (const byte of bytesToChecksum) {
          checksum ^= byte;
        }
        break;
      case 'add_no_header':
        bytesToChecksum = [...data, ...footer];
        for (const byte of bytesToChecksum) {
          checksum = (checksum + byte) & 0xff;
        }
        break;
      case 'xor_no_header':
        bytesToChecksum = [...data, ...footer];
        for (const byte of bytesToChecksum) {
          checksum ^= byte;
        }
        break;
      case 'none':
      default:
        return [];
    }
    return [checksum];
}