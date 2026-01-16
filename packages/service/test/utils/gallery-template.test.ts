
import { describe, it, expect } from 'vitest';
import { expandGalleryTemplate } from '../../src/utils/gallery-template';

describe('Security Check', () => {
  it('should not allow accessing global process object', () => {
    const maliciousSnippet = {
      entities: {
        light: [
          {
            id: 'test',
            name: '{{ process.cwd() }}'
          }
        ]
      }
    };

    try {
      const result = expandGalleryTemplate(maliciousSnippet as any, {});
      console.log('Result:', JSON.stringify(result, null, 2));
      // If it returns the cwd, it's vulnerable.
      // We expect it to throw or fail to resolve 'process'.

      const name = (result.entities as any).light[0].name;
      console.log('Executed name:', name);

      if (typeof name === 'string' && name.includes('/')) {
         throw new Error('VULNERABILITY DETECTED: Managed to access process.cwd()');
      }
      throw new Error('Should have failed execution of process.cwd()');

    } catch (e: any) {
      if (e.message.includes('VULNERABILITY DETECTED')) {
        throw e;
      }
      // Expect "process is not defined"
      expect(e.message).toContain('process is not defined');
    }
  });

  it('should allow benign expressions', () => {
    const snippet = {
      parameters: [
        { name: 'num', type: 'integer', default: 10 }
      ],
      entities: {
        light: [
          {
             id: 'test',
             name: '{{ num * 2 }}'
          }
        ]
      }
    };
    const result = expandGalleryTemplate(snippet as any, { num: 5 });
    // result comes back as a number if the whole string was a template expression and evaluated to a number?
    // Wait, resolveTemplateValue calls resolveTemplateValue -> evaluateTemplateExpression -> evaluateExpression
    // And resolveTemplateValue does:
    // if full match: return evaluated result (number)
    // else: replace (string)

    // In this case `{{ num * 2 }}` is a full match.
    // So name will be 10 (number).
    expect((result.entities as any).light[0].name).toBe(10);
  });
});
