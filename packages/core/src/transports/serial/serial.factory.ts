// packages/core/src/transports/serial/serial.factory.ts
import { Duplex } from 'stream';
import net from 'net';
import { SerialPort } from 'serialport';
import { isTcpConnection, waitForSerialDevice, openSerialPort } from './serial.connection.js';
import { SerialConfig } from '../../config/types.js';
import { logger } from '../../utils/logger.js';

export async function createSerialPortConnection(
  serialPath: string,
  serialConfig: SerialConfig,
  timeoutMs?: number,
): Promise<Duplex> {
  let port: Duplex;
  if (isTcpConnection(serialPath)) {
    const [host, tcpPort] = serialPath.split(':');
    const portNumber = Number(tcpPort);

    const connectTcp = async (retries = 3, delayMs = 2000): Promise<net.Socket> => {
      return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port: portNumber });

        // Add explicit connection timeout
        const connectionTimeout = timeoutMs || 5000;
        const timeoutId = setTimeout(() => {
          socket.destroy();
          const err = new Error(`Connection timed out after ${connectionTimeout}ms`);
          (err as any).code = 'ETIMEDOUT';
          reject(err);
        }, connectionTimeout);

        const onConnect = () => {
          clearTimeout(timeoutId);
          socket.removeListener('error', onError);
          resolve(socket);
        };

        const onError = async (err: Error) => {
          clearTimeout(timeoutId);
          socket.removeListener('connect', onConnect);
          socket.destroy();

          if (retries > 0) {
            logger.warn(
              { err, remainingRetries: retries },
              '[serial] failed to connect TCP, retrying...',
            );
            await new Promise((r) => setTimeout(r, delayMs));
            try {
              const newSocket = await connectTcp(retries - 1, delayMs);
              resolve(newSocket);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(err);
          }
        };

        socket.once('connect', onConnect);
        socket.once('error', onError);
      });
    };

    // If timeout is specified (e.g. testing), do not retry
    const maxRetries = timeoutMs !== undefined ? 0 : 3;
    port = await connectTcp(maxRetries);
  } else {
    await waitForSerialDevice(serialPath, timeoutMs);
    const serialPort = new SerialPort({
      path: serialPath,
      baudRate: serialConfig.baud_rate,
      dataBits: serialConfig.data_bits,
      parity: serialConfig.parity,
      stopBits: serialConfig.stop_bits,
      autoOpen: false,
    });
    port = serialPort;
    await openSerialPort(serialPort);
  }
  return port;
}
