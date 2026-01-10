import { bench, describe } from 'vitest';
import { Buffer } from 'buffer';

// Simulating the dependencies
const BIGINT_CACHE = new Array(256).fill(0).map((_, i) => BigInt(i));

class StandardProxyFactory {
  create(buffer: Uint8Array) {
    return new Proxy([], {
      get: (target, prop) => {
        if (typeof prop === 'string') {
          const idx = Number(prop);
          if (Number.isInteger(idx) && idx >= 0 && idx < buffer.length) {
            return BIGINT_CACHE[buffer[idx]];
          }
        }
        if (prop === 'length') return buffer.length;
        if (prop === Symbol.iterator) {
           return function* () {
            for (let i = 0; i < buffer.length; i++) {
              yield BIGINT_CACHE[buffer[i]];
            }
          };
        }
        return Reflect.get(target, prop);
      },
    });
  }
}

class LazyBufferView {
  private buffer: Uint8Array | null = null;
  private offset = 0;
  private length = 0;
  public proxy: any;

  constructor() {
    this.proxy = new Proxy([], {
      get: (target, prop) => {
        if (typeof prop === 'string') {
          const idx = Number(prop);
          if (Number.isInteger(idx) && idx >= 0 && idx < this.length) {
            return BIGINT_CACHE[this.buffer![this.offset + idx]];
          }
        }
        if (prop === 'length') return this.length;
        if (prop === Symbol.iterator) {
          const self = this;
          return function* () {
            for (let i = 0; i < self.length; i++) {
              yield BIGINT_CACHE[self.buffer![self.offset + i]];
            }
          };
        }
        return Reflect.get(target, prop);
      },
    });
  }

  update(buffer: Uint8Array, offset: number, length: number) {
    this.buffer = buffer;
    this.offset = offset;
    this.length = length;
  }
}

const factory = new StandardProxyFactory();
const lazy = new LazyBufferView();
const buffer = Buffer.alloc(1000).fill(1);

describe('Buffer Proxy Allocation', () => {
  bench('Standard: Subarray + New Proxy', () => {
    // Simulate Strategy C loop where we slice differently each time
    for (let len = 10; len < 100; len++) {
       const sub = buffer.subarray(0, len);
       const p = factory.create(sub);
       // Simulate access
       const v = p[5];
    }
  });

  bench('Optimized: Lazy Update', () => {
    for (let len = 10; len < 100; len++) {
       lazy.update(buffer, 0, len);
       const p = lazy.proxy;
       // Simulate access
       const v = p[5];
    }
  });
});
