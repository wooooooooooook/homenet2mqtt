import type { Server } from 'node:http';
import { logger } from '@rs485-homenet/core';

export const listen = (server: Server, listenPort: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(listenPort);
  });

const isPortInUse = (err: unknown): boolean => (err as NodeJS.ErrnoException).code === 'EADDRINUSE';

/**
 * Binds `server` to `startPort`, walking forward while the port is taken.
 * Non-collision errors (EACCES, ...) are rethrown so callers can decide,
 * and the returned port is the one actually bound.
 */
export const listenWithFallback = async (
  server: Server,
  startPort: number,
  maxAttempts = 10,
  label = 'server',
): Promise<number> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = startPort + attempt;
    try {
      await listen(server, port);
      if (attempt > 0) {
        logger.warn(`[service] ${label} port ${startPort} was in use, bound to ${port} instead.`);
      }
      return port;
    } catch (err) {
      if (!isPortInUse(err)) throw err;
      logger.warn({ port }, `[service] ${label} port in use, trying the next one...`);
    }
  }

  throw new Error(
    `Could not find an available ${label} port in ${startPort}..${startPort + maxAttempts - 1}.`,
  );
};
