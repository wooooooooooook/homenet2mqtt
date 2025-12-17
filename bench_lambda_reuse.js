
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const lambdaScript = 'return data[0] + len;';

class ReuseContextExecutor {
  constructor() {
    this.context = vm.createContext({
      Math: Math,
    });
    this.scriptCache = new Map();
  }

  execute(scriptStr, contextData) {
    let script = this.scriptCache.get(scriptStr);
    if (!script) {
        const code = `(function() { ${scriptStr} })()`;
        script = new vm.Script(code);
        this.scriptCache.set(scriptStr, script);
    }

    // Copy data to context
    // This assumes no async interleaving (safe in Node.js for synchronous ops)
    Object.assign(this.context, contextData);

    const result = script.runInContext(this.context, { timeout: 100 });

    // Optional: cleanup to prevent memory leaks if contextData has large objects?
    // But contextData usually just references buffers/numbers.
    // Overwriting next time is fine.

    return result;
  }
}

const executor = new ReuseContextExecutor();
const iterations = 1000;
const data = [1, 2, 3];
const len = 3;

const start = performance.now();
for (let i = 0; i < iterations; i++) {
  executor.execute(lambdaScript, { data, len });
}
const end = performance.now();

console.log(`ReuseContext Executor: ${(end - start).toFixed(2)}ms for ${iterations} iterations`);
