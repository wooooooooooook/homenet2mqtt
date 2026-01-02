import { describe, it, expect } from 'vitest';
import { SensorDevice } from '../../src/protocol/devices/sensor.device';
import { BinarySensorDevice } from '../../src/protocol/devices/binary-sensor.device';
import { SensorEntity } from '../../src/domain/entities/sensor.entity';
import { BinarySensorEntity } from '../../src/domain/entities/binary-sensor.entity';
import { ProtocolConfig } from '../../src/protocol/types';

const protocolConfig: ProtocolConfig = {
  packet_defaults: { rx_length: 5 },
};

describe('Sensor Entity', () => {
  const sensorConfig: SensorEntity = {
    id: 'test_sensor',
    name: 'Test Sensor',
    type: 'sensor',
    state: { offset: 0, data: [0x70] },
    state_number: { offset: 1, length: 1 },
    unit_of_measurement: '°C',
    device_class: 'temperature',
  };

  it('should parse value', () => {
    const device = new SensorDevice(sensorConfig, protocolConfig);
    // Value 25 (0x19)
    expect(device.parseData(Buffer.from([0x70, 0x19]))).toMatchObject({ value: 25 });
  });

  it('should handle precision', () => {
    const precisionConfig: SensorEntity = {
      ...sensorConfig,
      state_number: { offset: 1, length: 1, precision: 1 },
    };
    const device = new SensorDevice(precisionConfig, protocolConfig);
    // Value 25 (0x19) -> 2.5
    expect(device.parseData(Buffer.from([0x70, 0x19]))).toMatchObject({ value: 2.5 });
  });
});

describe('Binary Sensor Entity', () => {
  const binarySensorConfig: BinarySensorEntity = {
    id: 'test_binary_sensor',
    name: 'Test Binary Sensor',
    type: 'binary_sensor',
    state: { offset: 0, data: [0x71] },
    state_on: { offset: 1, data: [0x01] },
    state_off: { offset: 1, data: [0x00] },
    device_class: 'door',
  };

  it('should parse ON/OFF state', () => {
    const device = new BinarySensorDevice(binarySensorConfig, protocolConfig);

    expect(device.parseData(Buffer.from([0x71, 0x01]))).toMatchObject({ state: 'ON' });
    expect(device.parseData(Buffer.from([0x71, 0x00]))).toMatchObject({ state: 'OFF' });
  });
});
