import { ProtocolManager } from '../dist/protocol/protocol-manager.js';
import { Device } from '../dist/protocol/device.js';

class TestDevice extends Device {
  parseData(packet) {
    if (!this.matchesPacket(packet)) {
      return null;
    }
    return { state: packet[1] };
  }

  constructCommand() {
    return null;
  }
}

process.env.VITEST = '1';

const config = {
  packet_defaults: {
    rx_length: 5,
  },
};

const deviceConfig = {
  id: 'perf_device',
  name: 'Perf Device',
  state: {
    data: [0x01],
  },
};

const manager = new ProtocolManager(config);
manager.registerDevice(new TestDevice(deviceConfig, config));

const packet = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
const count = 50000;
const chunk = Buffer.alloc(packet.length * count);

for (let i = 0; i < count; i += 1) {
  packet.copy(chunk, i * packet.length);
}

console.log(`Running packet processing perf with ${count} packets...`);
const start = process.hrtime.bigint();
manager.handleIncomingChunk(chunk);
const end = process.hrtime.bigint();

console.log(`Processed ${count} packets in ${Number(end - start) / 1e6} ms`);
