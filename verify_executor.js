
import { LambdaExecutor } from './packages/core/dist/protocol/lambda-executor.js';
import { Buffer } from 'buffer';

const executor = new LambdaExecutor();

console.log('Testing Safe Mode...');
const resultSafe = executor.execute({ type: 'lambda', script: 'return x * 2;' }, { x: 10 });
console.log('Safe Result (10*2):', resultSafe, resultSafe === 20 ? 'OK' : 'FAIL');

console.log('Testing Fast Mode...');
const resultFast = executor.execute({ type: 'lambda', script: 'return x * 2;' }, { x: 10 }, { allowNoTimeout: true });
console.log('Fast Result (10*2):', resultFast, resultFast === 20 ? 'OK' : 'FAIL');

console.log('Testing Buffer Access in Fast Mode...');
const buf = Buffer.from([10, 20]);
const resultBuf = executor.execute(
    { type: 'lambda', script: 'return data[0] + data[1];' },
    { data: buf, len: 2 },
    { allowNoTimeout: true }
);
console.log('Buffer Result (10+20):', resultBuf, resultBuf === 30 ? 'OK' : 'FAIL');

// Test persistence/isolation in Safe Mode
console.log('Testing Isolation...');
executor.execute({ type: 'lambda', script: 'x = 100;' }, { x: 0 });
const resultIsolation = executor.execute({ type: 'lambda', script: 'return typeof x;' }, {});
// x should not persist as global if we cleaned up context, OR it might persist if we only delete keys we passed.
// But 'x = 100' without declaration sets global x.
// Our cleanup deletes keys from contextData. 'x' was in contextData (Wait, first call {x:0}).
// So 'x' was assigned.
// Second call contextData={}
// Does 'x' persist?
console.log('Isolation Result:', resultIsolation);
// If result is 'undefined', then it's isolated/cleaned.
// If result is 'number', it leaked.
