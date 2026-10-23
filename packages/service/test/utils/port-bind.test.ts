import { describe, it, expect, afterEach, vi } from 'vitest';
import net from 'node:net';
import http from 'node:http';

vi.mock('@rs485-homenet/core', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { listen, listenWithFallback } from '../../src/utils/port-bind.js';

const occupy = async (port: number): Promise<net.Server> => {
  const blocker = net.createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(port, '127.0.0.1', () => {
      blocker.off('error', reject);
      resolve();
    });
  });
  return blocker;
};

const closeAll = async (servers: net.Server[]): Promise<void> => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          // http.Server exposes closeAllConnections; net.Server does not.
          const closeConnections = (server as { closeAllConnections?: () => void })
            .closeAllConnections;
          closeConnections?.call(server);
          server.close(() => resolve());
        }),
    ),
  );
};

describe('port bind fallback', () => {
  const blockers: net.Server[] = [];
  const bound: http.Server[] = [];

  afterEach(async () => {
    await closeAll(bound);
    await closeAll(blockers);
    blockers.length = 0;
    bound.length = 0;
  });

  const newServer = (): http.Server => {
    const server = http.createServer((_req, res) => res.end('ok'));
    bound.push(server);
    return server;
  };

  it('resolves once the server is listening', async () => {
    const blocker = await occupy(0);
    blockers.push(blocker);
    const port = (blocker.address() as net.AddressInfo).port;

    await expect(listen(newServer(), port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('walks to the next port when the requested one is taken', async () => {
    const blocker = await occupy(3401);
    blockers.push(blocker);

    const port = await listenWithFallback(newServer(), 3401, 5, 'Agent API');

    expect(port).toBe(3402);
  });

  it('keeps walking past several busy ports', async () => {
    blockers.push(await occupy(3410), await occupy(3411));

    const port = await listenWithFallback(newServer(), 3410, 5, 'Agent API');

    expect(port).toBe(3412);
  });

  it('gives up after exhausting the attempt budget', async () => {
    blockers.push(await occupy(3420), await occupy(3421));

    await expect(listenWithFallback(newServer(), 3420, 2, 'Agent API')).rejects.toThrow(
      /Could not find an available Agent API port in 3420\.\.3421/,
    );
  });

  it('does not retry on errors that are not port collisions', async () => {
    const server = newServer();
    const failure = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const spy = vi.spyOn(server, 'listen').mockImplementation((() => {
      setImmediate(() => server.emit('error', failure));
      return server;
    }) as unknown as typeof server.listen);

    await expect(listenWithFallback(server, 3430, 5, 'Agent API')).rejects.toBe(failure);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
