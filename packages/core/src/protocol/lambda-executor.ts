import vm from 'node:vm';
import { LambdaConfig } from './types.js';
import { logger } from '../utils/logger.js';

export interface LambdaExecutionOptions {
  /**
   * If true, uses vm.compileFunction for significantly faster execution (~1500x).
   * WARNING: Disables timeout protection and runs in a shared context. Use only for trusted, simple scripts (e.g. checksums).
   */
  allowNoTimeout?: boolean;
}

export class LambdaExecutor {
  private sandbox: Record<string, any>;
  private sharedContext: vm.Context;
  private fnCache = new Map<string, Function>();
  private scriptCache = new Map<string, vm.Script>();

  // Superset of all potential arguments used in lambdas across the application
  // strictly for use with compileFunction (fast mode)
  private static ARGUMENT_NAMES = [
    'data',
    'len',
    'x',
    'state',
    'id',
    'states',
    'trigger',
    'timestamp',
    'command',
    'publish',
  ];

  constructor() {
    // Define safe helper functions and constants
    this.sandbox = {
      // Helper: Convert BCD to Integer
      bcd_to_int: (bcd: number): number => {
        return (bcd >> 4) * 10 + (bcd & 0x0f);
      },
      // Helper: Convert Integer to BCD
      int_to_bcd: (int: number): number => {
        return (Math.floor(int / 10) % 10 << 4) | int % 10;
      },
      // Helper: Log to console (safe wrapper)
      log: (...args: any[]) => {
        // logger.debug({ args }, '[Lambda] Log');
      },
      // Standard Math functions
      Math: Math,
      // Standard Number functions
      Number: Number,
      // Standard Boolean functions
      Boolean: Boolean,
      // Standard String functions
      String: String,
    };

    // Shared context for Fast Mode
    this.sharedContext = vm.createContext({ ...this.sandbox });
  }

  public execute(
    lambda: LambdaConfig,
    contextData: Record<string, any>,
    options: LambdaExecutionOptions = {},
  ): any {
    try {
      if (options.allowNoTimeout) {
        return this.executeFast(lambda, contextData);
      } else {
        return this.executeSafe(lambda, contextData);
      }
    } catch (error) {
      logger.error({ error, script: lambda.script }, '[Lambda] Execution failed');
      return null;
    }
  }

  private executeFast(lambda: LambdaConfig, contextData: Record<string, any>): any {
    let fn = this.fnCache.get(lambda.script);

    if (!fn) {
      fn = vm.compileFunction(lambda.script, LambdaExecutor.ARGUMENT_NAMES, {
        parsingContext: this.sharedContext,
      });
      this.fnCache.set(lambda.script, fn);
    }

    // Call with arguments mapped from contextData
    return fn(
      contextData.data,
      contextData.len,
      contextData.x,
      contextData.state,
      contextData.id,
      contextData.states,
      contextData.trigger,
      contextData.timestamp,
      contextData.command,
      contextData.publish,
    );
  }

  private executeSafe(lambda: LambdaConfig, contextData: Record<string, any>): any {
    let script = this.scriptCache.get(lambda.script);

    if (!script) {
      // Wrap script in a function IIFE to allow return statements
      const scriptCode = `
        (function() {
          ${lambda.script}
        })()
      `;
      script = new vm.Script(scriptCode);
      this.scriptCache.set(lambda.script, script);
    }

    // Create a fresh isolated context for each execution
    // This preserves the original behavior for Automations (isolation + timeout)
    const executionContext = vm.createContext({
      ...this.sandbox,
      ...contextData,
    });

    return script.runInContext(executionContext, {
      timeout: 100, // 100ms timeout protection
      displayErrors: true,
    });
  }
}
