import { describe, it, expect } from 'vitest';
import { evaluateDiscovery, DiscoverySchema } from '../src/services/discovery.service.js';
import { expandGalleryTemplate, GallerySnippet } from '../src/utils/gallery-template.js';

describe('Discovery Logic Improvements', () => {
  it('should match packets using regex', () => {
    const schema: DiscoverySchema = {
      match: {
        regex: 'B0 41 .. 02',
      },
      dimensions: [],
    };

    const packets = {
      '1': 'B0 41 01 02', // Matches
      '2': 'B0 41 FF 02', // Matches
      '3': 'B0 41 00 03', // No Match
    };

    const result = evaluateDiscovery(schema, packets, []);
    expect(result.matched).toBe(true);
    expect(result.matchedPacketCount).toBe(2);
  });

  it('should match packets using CEL condition', () => {
    const schema: DiscoverySchema = {
      match: {
        condition: 'data[2] > 0x10 && data[3] == 0x02',
      },
      dimensions: [],
    };

    const packets = {
      '1': 'B0 41 11 02', // Matches (0x11 > 0x10)
      '2': 'B0 41 05 02', // No Match (0x05 <= 0x10)
    };

    const result = evaluateDiscovery(schema, packets, []);
    expect(result.matched).toBe(true);
    expect(result.matchedPacketCount).toBe(1);
  });

  it('should transform dimensions using CEL', () => {
    const schema: DiscoverySchema = {
      match: {
        data: [0xB0],
      },
      dimensions: [
        {
          parameter: 'val',
          offset: 1,
          transform: 'x * 10',
        },
        {
          parameter: 'shifted',
          offset: 1,
          transform: 'bitShiftLeft(x, 1)',
        }
      ],
      inference: { strategy: 'max' },
    };

    const packets = {
      '1': 'B0 05', // val=50, shifted=10
    };

    const result = evaluateDiscovery(schema, packets, []);
    expect(result.parameterValues.val).toBe(50);
    expect(result.parameterValues.shifted).toBe(10);
  });
});

describe('Gallery Template Improvements', () => {
  it('should resolve dynamic default values using CEL', () => {
    const snippet: GallerySnippet = {
      parameters: [
        {
          name: 'count',
          type: 'integer',
          default: '{{ discovery.count * 2 }}',
        },
      ],
    };

    const discoveryResult = {
      matched: true,
      matchedPacketCount: 5,
      parameterValues: {},
    };

    const expanded = expandGalleryTemplate(snippet, {}, discoveryResult);
    // expanded parameters are resolved and put into context, but expandGalleryTemplate removes parameters from output.
    // However, we can check if entities are expanded correctly or check intermediate if we could.
    // Instead, let's put the parameter into an entity field to verify.
    
    snippet.entities = {
      test_value: '{{ count }}'
    };
    
    const result = expandGalleryTemplate(snippet, {}, discoveryResult);
    expect(result.entities?.test_value).toBe(10); // 5 * 2
  });

  it('should handle hidden parameters', () => {
    const snippet: GallerySnippet = {
      parameters: [
        {
          name: 'hidden_val',
          type: 'integer',
          hidden: true,
          default: 100,
        },
      ],
      entities: {
        val: '{{ hidden_val }}'
      }
    };

    // Should not throw missing parameter error even if not provided in input
    const result = expandGalleryTemplate(snippet, {});
    expect(result.entities?.val).toBe(100);
  });
});
