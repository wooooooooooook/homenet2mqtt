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
      if (entityConfig.state_on && this.matchState(packet, entityConfig.state_on)) {
        updates.state = 'ON';
      } else if (entityConfig.state_off && this.matchState(packet, entityConfig.state_off)) {
        updates.state = 'OFF';
      }
    }

    return Object.keys(updates).length > 0 ? updates : null;
  }
}
