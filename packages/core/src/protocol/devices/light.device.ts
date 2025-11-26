import { GenericDevice } from './generic.device.js';
import { DeviceConfig, ProtocolConfig } from '../types.js';
import { LightEntity } from '../../domain/entities/light.entity.js';

export class LightDevice extends GenericDevice {
  constructor(config: DeviceConfig, protocolConfig: ProtocolConfig) {
    super(config, protocolConfig);
  }

  public parseData(packet: number[]): Record<string, any> | null {
    if (!this.matchesPacket(packet)) {
      return null;
    }
    // First try lambda parsing from GenericDevice
    const updates = super.parseData(packet) || {};
    const entityConfig = this.config as LightEntity;

    // Handle state_on / state_off schemas if defined and not lambdas
    if (!updates.state) {
      if (entityConfig.state_on && this.matchState(packet, entityConfig.state_on)) {
        updates.state = 'ON';
      } else if (entityConfig.state_off && this.matchState(packet, entityConfig.state_off)) {
        updates.state = 'OFF';
      }
    }

    // Parse brightness
    if (!updates.brightness && entityConfig.state_brightness) {
      const brightness = this.extractValue(packet, entityConfig.state_brightness);
      if (brightness !== null) {
        updates.brightness = brightness;
      }
    }

    // Parse color temperature (mireds)
    if (!updates.color_temp && entityConfig.state_color_temp) {
      const colorTemp = this.extractValue(packet, entityConfig.state_color_temp);
      if (colorTemp !== null) {
        updates.color_temp = colorTemp;
      }
    }

    // Parse RGB colors
    if (!updates.red && entityConfig.state_red) {
      const red = this.extractValue(packet, entityConfig.state_red);
      if (red !== null) updates.red = red;
    }
    if (!updates.green && entityConfig.state_green) {
      const green = this.extractValue(packet, entityConfig.state_green);
      if (green !== null) updates.green = green;
    }
    if (!updates.blue && entityConfig.state_blue) {
      const blue = this.extractValue(packet, entityConfig.state_blue);
      if (blue !== null) updates.blue = blue;
    }

    // Parse white value
    if (!updates.white && entityConfig.state_white) {
      const white = this.extractValue(packet, entityConfig.state_white);
      if (white !== null) {
        updates.white = white;
      }
    }

    return Object.keys(updates).length > 0 ? updates : null;
  }

  public constructCommand(commandName: string, value?: any): number[] | null {
    const entityConfig = this.config as LightEntity;
    const commandConfig = (entityConfig as any)[`command_${commandName}`];

    // If lambda, let GenericDevice handle it
    if (commandConfig && commandConfig.type === 'lambda') {
      return super.constructCommand(commandName, value);
    }

    // Handle standard on/off commands
    if (commandName === 'on' && entityConfig.command_on?.data) {
      return [...entityConfig.command_on.data];
    }
    if (commandName === 'off' && entityConfig.command_off?.data) {
      return [...entityConfig.command_off.data];
    }

    // Handle brightness command
    if (
      commandName === 'brightness' &&
      entityConfig.command_brightness?.data &&
      value !== undefined
    ) {
      const command = [...entityConfig.command_brightness.data];
      const valueOffset = (entityConfig.command_brightness as any).value_offset;
      if (valueOffset !== undefined) {
        command[valueOffset] = Math.round(value);
      }
      return command;
    }

    // Handle color temperature command
    if (
      commandName === 'color_temp' &&
      entityConfig.command_color_temp?.data &&
      value !== undefined
    ) {
      const command = [...entityConfig.command_color_temp.data];
      const valueOffset = (entityConfig.command_color_temp as any).value_offset;
      const length = (entityConfig.command_color_temp as any).length || 2;
      if (valueOffset !== undefined) {
        const val = Math.round(value);
        if (length === 2) {
          command[valueOffset] = (val >> 8) & 0xff;
          command[valueOffset + 1] = val & 0xff;
        } else {
          command[valueOffset] = val;
        }
      }
      return command;
    }

    // Handle RGB commands
    if (commandName === 'red' && entityConfig.command_red?.data && value !== undefined) {
      const command = [...entityConfig.command_red.data];
      const valueOffset = (entityConfig.command_red as any).value_offset;
      if (valueOffset !== undefined) {
        command[valueOffset] = Math.round(value);
      }
      return command;
    }
    if (commandName === 'green' && entityConfig.command_green?.data && value !== undefined) {
      const command = [...entityConfig.command_green.data];
      const valueOffset = (entityConfig.command_green as any).value_offset;
      if (valueOffset !== undefined) {
        command[valueOffset] = Math.round(value);
      }
      return command;
    }
    if (commandName === 'blue' && entityConfig.command_blue?.data && value !== undefined) {
      const command = [...entityConfig.command_blue.data];
      const valueOffset = (entityConfig.command_blue as any).value_offset;
      if (valueOffset !== undefined) {
        command[valueOffset] = Math.round(value);
      }
      return command;
    }

    // Handle white value command
    if (commandName === 'white' && entityConfig.command_white?.data && value !== undefined) {
      const command = [...entityConfig.command_white.data];
      const valueOffset = (entityConfig.command_white as any).value_offset;
      if (valueOffset !== undefined) {
        command[valueOffset] = Math.round(value);
      }
      return command;
    }

    return null;
  }
}
