import pino from 'pino';
import { logBuffer } from './log-buffer.js';

const rawLevel = process.env.LOG_LEVEL || 'info';
const logLevel = rawLevel === 'warning' ? 'warn' : rawLevel;

export const logger = pino({
  level: logLevel,
  hooks: {
    logMethod(inputArgs, method, level) {
      const levelLabel = pino.levels.labels[level] || 'unknown';
      logBuffer.add(levelLabel, inputArgs);
      return method.apply(this, inputArgs);
    },
  },
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});
