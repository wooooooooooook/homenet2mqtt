import { GenericDevice } from './generic.device.js';
import { DeviceConfig, ProtocolConfig } from '../types.js';
import { BinarySensorEntity } from '../../domain/entities/binary-sensor.entity.js';

export class BinarySensorDevice extends GenericDevice {
  constructor(config: BinarySensorEntity, protocolConfig: ProtocolConfig) {
    super(config, protocolConfig);
  }

  public parseData(packet: number[]): Record<string, any> | null {
    if (!this.matchesPacket(packet)) {
      return null;
    }

    const updates = super.parseData(packet) || {};
    const entityConfig = this.config as BinarySensorEntity;

    // Handle state_on / state_off schemas
    if (!updates.state) {
      if (this.matchesSchema(packet, entityConfig.state_on)) {
        updates.state = 'ON';
      } else if (this.matchesSchema(packet, entityConfig.state_off)) {
        updates.state = 'OFF';
      }
    }

    return Object.keys(updates).length > 0 ? updates : null;
  }

  private matchesSchema(packet: number[], schema: any): boolean {
    if (!schema || !schema.data) return false;

    const headerLength = this.protocolConfig.packet_defaults?.rx_header?.length || 0;
    const offset = (schema.offset || 0) + headerLength;
    if (packet.length < offset + schema.data.length) return false;

    for (let i = 0; i < schema.data.length; i++) {
      const mask = schema.mask ? (Array.isArray(schema.mask) ? schema.mask[i] : schema.mask) : 0xff;
      if ((packet[offset + i] & mask) !== (schema.data[i] & mask)) {
        return false;
      }
    }
    return true;
  }
}
