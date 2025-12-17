
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { Buffer } = require('buffer');

const lambdaScript = 'return data[0] + len;';

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
        const argNames = ['data', 'len', 'x', 'state'];
        fn = vm.compileFunction(scriptStr, argNames, { parsingContext: this.context });
        this.cache.set(scriptStr, fn);
    }

    // Call with arguments
    return fn(contextData.data, contextData.len, contextData.x, contextData.state);
  }
}

const newExecutor = new NewLambdaExecutor();

const data = Buffer.from([1, 2, 3]);
const len = 3;

try {
  const result = newExecutor.execute(lambdaScript, { data, len });
  console.log('Result with Buffer:', result);
  console.log('Correct?', result === 4);
} catch (e) {
  console.error(e);
}
