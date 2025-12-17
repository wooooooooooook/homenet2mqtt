
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const lambdaScript = 'return data[0] + len;';

class OldLambdaExecutor {
  constructor() {
    this.context = vm.createContext({
      Math: Math,
    });
  }

  execute(scriptStr, contextData) {
      const executionContext = vm.createContext({
        ...this.context,
        ...contextData,
      });

      const scriptCode = `(function() { ${scriptStr} })()`;
      const script = new vm.Script(scriptCode);
      return script.runInContext(executionContext);
  }
}

class NewLambdaExecutor {
  constructor() {
    this.context = vm.createContext({
      Math: Math,
    });
    this.cache = new Map();
  }

  execute(scriptStr, contextData) {
    let fn = this.cache.get(scriptStr);
    if (!fn) {
        // We assume contextData keys are stable-ish or we pass strict arguments
        const argNames = ['data', 'len', 'x', 'state'];
        fn = vm.compileFunction(scriptStr, argNames, { parsingContext: this.context });
        this.cache.set(scriptStr, fn);
    }

    // Call with arguments
    return fn(contextData.data, contextData.len, contextData.x, contextData.state);
  }
}

const oldExecutor = new OldLambdaExecutor();
const newExecutor = new NewLambdaExecutor();

const iterations = 1000;
const data = [1, 2, 3];
const len = 3;

const startOld = performance.now();
for (let i = 0; i < iterations; i++) {
  oldExecutor.execute(lambdaScript, { data, len });
}
const endOld = performance.now();

const startNew = performance.now();
for (let i = 0; i < iterations; i++) {
  newExecutor.execute(lambdaScript, { data, len });
}
const endNew = performance.now();

console.log(`Old Executor: ${(endOld - startOld).toFixed(2)}ms for ${iterations} iterations`);
console.log(`New Executor: ${(endNew - startNew).toFixed(2)}ms for ${iterations} iterations`);
console.log(`Speedup: ${(endOld - startOld) / (endNew - startNew)}x`);
