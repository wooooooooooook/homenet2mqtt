import { GenericDevice } from './generic.device.js';
import { DeviceConfig, ProtocolConfig } from '../types.js';
import { ValveEntity } from '../../domain/entities/valve.entity.js';

export class ValveDevice extends GenericDevice {
    constructor(config: DeviceConfig, protocolConfig: ProtocolConfig) {
        super(config, protocolConfig);
    }

    public parseData(packet: number[]): Record<string, any> | null {
        if (!this.matchesPacket(packet)) {
            return null;
        }
        const updates = super.parseData(packet) || {};
        const entityConfig = this.config as ValveEntity;

        // Handle basic open/closed states
        if (!updates.state) {
            if (this.matchesSchema(packet, entityConfig.state_open)) {
                updates.state = 'OPEN';
            } else if (this.matchesSchema(packet, entityConfig.state_closed)) {
                updates.state = 'CLOSED';
            } else if (this.matchesSchema(packet, entityConfig.state_opening)) {
                updates.state = 'OPENING';
            } else if (this.matchesSchema(packet, entityConfig.state_closing)) {
                updates.state = 'CLOSING';
            }
        }

        // Handle position (0-100%)
        if (!updates.position && entityConfig.state_position) {
            const position = this.extractValue(packet, entityConfig.state_position);
            if (position !== null) {
                updates.position = Math.min(100, Math.max(0, position));
            }
        }

        return Object.keys(updates).length > 0 ? updates : null;
    }

    private extractValue(packet: number[], schema: any): number | null {
        if (!schema) return null;
        const offset = schema.offset || 0;
        const length = schema.length || 1;

        if (packet.length < offset + length) return null;

        let value = 0;
        for (let i = 0; i < length; i++) {
            value = (value << 8) | packet[offset + i];
        }

        if (schema.precision !== undefined) {
            value = value / Math.pow(10, schema.precision);
        }

        return value;
    }

    private matchesSchema(packet: number[], schema: any): boolean {
        if (!schema || !schema.data) return false;
        const offset = schema.offset || 0;
        if (packet.length < offset + schema.data.length) return false;

        for (let i = 0; i < schema.data.length; i++) {
            const mask = schema.mask ? schema.mask[i] : 0xFF;
            if ((packet[offset + i] & mask) !== (schema.data[i] & mask)) {
                return false;
            }
        }
        return true;
    }

    public constructCommand(commandName: string, value?: any): number[] | null {
        const entityConfig = this.config as ValveEntity;
        const commandConfig = (entityConfig as any)[`command_${commandName}`];

        // If lambda, let GenericDevice handle it
        if (commandConfig && commandConfig.type === 'lambda') {
            return super.constructCommand(commandName, value);
        }

        if (commandName === 'open' && entityConfig.command_open?.data) {
            return [...entityConfig.command_open.data];
        }
        if (commandName === 'close' && entityConfig.command_close?.data) {
            return [...entityConfig.command_close.data];
        }

        // Handle stop command
        if (commandName === 'stop' && entityConfig.command_stop?.data) {
            return [...entityConfig.command_stop.data];
        }

        // Handle position command (0-100%)
        if (commandName === 'position' && entityConfig.command_position?.data && value !== undefined) {
            const command = [...entityConfig.command_position.data];
            const valueOffset = (entityConfig.command_position as any).value_offset;
            if (valueOffset !== undefined) {
                const position = Math.min(100, Math.max(0, Math.round(value)));
                command[valueOffset] = position;
            }
            return command;
        }

        return null;
    }
}
