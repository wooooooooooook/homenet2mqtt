// packages/core/src/transports/serial/serial.factory.ts
import { Duplex } from 'stream';
import net from 'net';
import { SerialPort } from 'serialport';
import { isTcpConnection, waitForSerialDevice, openSerialPort } from './serial.connection.js';
import { HomenetBridgeConfig } from '../../config/types.js';
import { logger } from '../../utils/logger.js';

export async function createSerialPortConnection(
  serialPath: string,
  serialConfig: HomenetBridgeConfig['serial'],
): Promise<Duplex> {
  logger.info({ serialPath, baudRate: serialConfig.baud_rate }, '[serial] 시리얼 포트 연결 시도');

  let port: Duplex;
  if (isTcpConnection(serialPath)) {
    const [host, tcpPort] = serialPath.split(':');
    port = net.createConnection({ host, port: Number(tcpPort) });
  } else {
    await waitForSerialDevice(serialPath);
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
