// packages/core/src/transports/serial/serial.factory.ts
import { Duplex } from 'stream';
import { SerialPort } from 'serialport';
import { isTcpConnection, waitForSerialDevice, openSerialPort } from './serial.connection.js';
import { ReconnectingTcpSocket } from './tcp-socket.js';
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

    logger.info({ host, port: portNumber }, '[serial] Creating TCP connection with auto-reconnect');

    const reconnectingSocket = new ReconnectingTcpSocket(host, portNumber, {
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      connectionTimeoutMs: timeoutMs || 5000,
    });

    // Initial connection with retries
    const maxRetries = timeoutMs !== undefined ? 0 : 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await reconnectingSocket.connect();
        port = reconnectingSocket;
        return port;
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries) {
          logger.warn(
            { err, remainingRetries: maxRetries - attempt },
            '[serial] Failed to connect TCP, retrying...',
          );
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    // All retries failed
    reconnectingSocket.destroy();
    throw lastError || new Error('Failed to connect to TCP server');
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
