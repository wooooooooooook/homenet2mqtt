import { GenericDevice } from './generic.device.js';
import { DeviceConfig, ProtocolConfig } from '../types.js';
import { NumberEntity } from '../../domain/entities/number.entity.js';

export class NumberDevice extends GenericDevice {
  constructor(config: NumberEntity, protocolConfig: ProtocolConfig) {
    super(config, protocolConfig);
  }

  public parseData(packet: number[]): Record<string, any> | null {
    if (!this.matchesPacket(packet)) {
      return null;
    }

    const updates = super.parseData(packet) || {};
    const entityConfig = this.config as NumberEntity;

    // Parse number value from state_number schema
    if (!updates.value && entityConfig.state_number) {
      const val = this.extractValue(packet, entityConfig.state_number);
      if (val !== null) {
        updates.value = val;
      }
    }

    // Check for increment/decrement/min/max state changes
    if (this.matchesSchema(packet, entityConfig.state_increment)) {
      updates.action = 'increment';
    } else if (this.matchesSchema(packet, entityConfig.state_decrement)) {
      updates.action = 'decrement';
    } else if (this.matchesSchema(packet, entityConfig.state_to_min)) {
      updates.value = entityConfig.min_value;
    } else if (this.matchesSchema(packet, entityConfig.state_to_max)) {
      updates.value = entityConfig.max_value;
    }

    return Object.keys(updates).length > 0 ? updates : null;
  }

  private extractValue(packet: number[], schema: any): number | null {
    if (!schema) return null;

    const headerLength = this.protocolConfig.packet_defaults?.rx_header?.length || 0;
    const offset = (schema.offset || 0) + headerLength;
    const length = schema.length || 1;
    const precision = schema.precision || 0;
    const signed = schema.signed !== undefined ? schema.signed : false;

    if (packet.length < offset + length) return null;

    let value = 0;

    // Extract multi-byte value
    if (length === 1) {
      value = packet[offset];
      if (signed && value > 127) {
        value = value - 256;
      }
    } else {
      // TODO: Handle endianness properly
      const endian = schema.endian || 'big';
      if (endian === 'big') {
        for (let i = 0; i < length; i++) {
          value = (value << 8) | packet[offset + i];
        }
      } else {
        for (let i = length - 1; i >= 0; i--) {
          value = (value << 8) | packet[offset + i];
        }
      }
    }

    // Apply precision
    if (precision > 0) {
      value = value / Math.pow(10, precision);
    }

    return value;
  }

  private matchesSchema(packet: number[], schema: any): boolean {
    if (!schema || !schema.data) return false;

    const headerLength = this.protocolConfig.packet_defaults?.rx_header?.length || 0;
    const offset = (schema.offset || 0) + headerLength;
    if (packet.length < offset + schema.data.length) return false;

    for (let i = 0; i < schema.data.length; i++) {
      let mask = 0xff;
      if (schema.mask) {
        if (Array.isArray(schema.mask)) {
          mask = schema.mask[i];
        } else {
          mask = schema.mask;
        }
      }

      if ((packet[offset + i] & mask) !== (schema.data[i] & mask)) {
        return false;
      }
    }
    return true;
  }

  public constructCommand(commandName: string, value?: any): number[] | null {
    const cmd = super.constructCommand(commandName, value);
    if (cmd) return cmd;

    const entityConfig = this.config as NumberEntity;

    // Handle number command with value
    if (commandName === 'set' && entityConfig.command_number?.data && value !== undefined) {
      const command = [...entityConfig.command_number.data];

      // If there's a value offset, insert the value
      const valueOffset = (entityConfig.command_number as any).value_offset;
      if (valueOffset !== undefined) {
        const length = (entityConfig.command_number as any).length || 1;
        const precision = (entityConfig.command_number as any).precision || 0;

        // Apply precision
        let intValue = Math.round(value * Math.pow(10, precision));

        // Insert value into command
        if (length === 1) {
          command[valueOffset] = intValue & 0xff;
        } else {
          // TODO: Handle multi-byte and endianness
          for (let i = 0; i < length; i++) {
            command[valueOffset + i] = (intValue >> (8 * (length - 1 - i))) & 0xff;
          }
        }
      }

      return command;
    }

    return null;
  }
}
