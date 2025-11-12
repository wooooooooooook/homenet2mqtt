// packages/core/src/packetProcessor.ts

import {
  HomenetBridgeConfig,
  PacketDefaults,
  EntityConfig,
  CommandSchema,
  StateSchema,
  StateNumSchema,
  ChecksumType,
  DecodeEncodeType,
  EndianType,
  LightEntity,
  ClimateEntity,
  ValveEntity,
  ButtonEntity,
  SensorEntity,
  FanEntity,
  SwitchEntity,
  BinarySensorEntity
} from './config.js';

export class PacketProcessor {
  private config: HomenetBridgeConfig;

  constructor(config: HomenetBridgeConfig) {
    this.config = config;
  }

  // Utility to convert hex string to byte array
  private hexToBytes(hex: string): number[] {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
  }

  // Utility to convert byte array to hex string
  private bytesToHex(bytes: number[]): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // --- Checksum Calculation Logic ---
  private calculateChecksum(
    data: number[],
    checksumType: ChecksumType | { type: 'custom'; algorithm: string },
    header: number[] = [],
    footer: number[] = []
  ): number[] {
    if (typeof checksumType === 'object' && checksumType.type === 'custom') {
      // For custom checksums, we'll need a more sophisticated interpreter
      // For now, we'll just return an empty array or throw an error
      console.warn(`Custom checksum algorithm '${checksumType.algorithm}' not yet implemented.`);
      return [];
    }

    let checksum = 0;
    let bytesToChecksum: number[] = [];

    switch (checksumType) {
      case 'add':
        bytesToChecksum = [...header, ...data, ...footer];
        for (const byte of bytesToChecksum) {
          checksum = (checksum + byte) & 0xFF; // Ensure 8-bit
        }
        break;
      case 'xor':
        bytesToChecksum = [...header, ...data, ...footer];
        for (const byte of bytesToChecksum) {
          checksum ^= byte;
        }
        break;
      case 'add_no_header':
        bytesToChecksum = [...data, ...footer];
        for (const byte of bytesToChecksum) {
          checksum = (checksum + byte) & 0xFF;
        }
        break;
      case 'xor_no_header':
        bytesToChecksum = [...data, ...footer];
        for (const byte of bytesToChecksum) {
          checksum ^= byte;
        }
        break;
      case 'none':
      default:
        return []; // No checksum
    }
    return [checksum];
  }

  // --- Value Encoding/Decoding Logic ---
  private decodeValue(
    bytes: number[],
    schema: StateNumSchema
  ): number | string | null {
    const { offset, length = 1, precision = 0, signed = false, endian = 'big', decode = 'none' } = schema;

    if (offset + length > bytes.length) {
      console.warn('Attempted to decode value outside of packet bounds.');
      return null;
    }

    const valueBytes = bytes.slice(offset, offset + length);
    if (endian === 'little') {
      valueBytes.reverse();
    }

    let value: number;
    switch (decode) {
      case 'bcd':
        value = 0;
        for (let i = 0; i < valueBytes.length; i++) {
          value = value * 100 + ((valueBytes[i] >> 4) * 10) + (valueBytes[i] & 0x0F);
        }
        break;
      case 'ascii':
        return String.fromCharCode(...valueBytes);
      case 'signed_byte_half_degree':
        // Custom logic for signed byte with 0.5 degree precision
        // Assuming the byte is like 0x80 for 0.5, 0x81 for 1.5, 0x01 for 1.0
        // This is a simplified interpretation, actual logic might be more complex
        value = valueBytes[0] & 0x7F; // Get the magnitude
        if ((valueBytes[0] & 0x80) !== 0) { // Check for 0.5 degree bit
          value += 0.5;
        }
        if (signed && (valueBytes[0] & 0x40) !== 0) { // Assuming a sign bit if needed
            value = -value;
        }
        break;
      case 'none':
      default:
        value = 0;
        for (let i = 0; i < valueBytes.length; i++) {
          value = (value << 8) | valueBytes[i];
        }
        break;
    }

    if (signed && (valueBytes[0] & 0x80) !== 0 && decode === 'none') { // Generic signed interpretation
        // Handle two's complement for generic signed numbers
        const signBit = 1 << (length * 8 - 1);
        if ((value & signBit) !== 0) {
            value = value - (2 * signBit);
        }
    }

    return precision > 0 ? parseFloat(value.toFixed(precision)) : value;
  }

  private encodeValue(
    value: number | string,
    schema: CommandSchema
  ): number[] {
    const { value_encode = 'none', length = 1, signed = false, endian = 'big' } = schema;

    let encodedBytes: number[] = [];

    if (typeof value === 'string') {
      if (value_encode === 'ascii') {
        encodedBytes = Array.from(value).map(char => char.charCodeAt(0));
      } else {
        console.warn(`Cannot encode string value with non-ascii encoding: ${value_encode}`);
        return [];
      }
    } else { // typeof value === 'number'
      let numValue = value;

      switch (value_encode) {
        case 'bcd':
          let bcd = [];
          let temp = Math.abs(numValue);
          while (temp > 0) {
            bcd.unshift(((temp % 100) / 10 << 4) | (temp % 10));
            temp = Math.floor(temp / 100);
          }
          encodedBytes = bcd;
          break;
        case 'signed_byte_half_degree':
            // Custom logic for encoding signed byte with 0.5 degree precision
            let byteValue = Math.floor(Math.abs(numValue));
            if (numValue % 1 !== 0) { // Check for 0.5
                byteValue |= 0x80;
            }
            if (signed && numValue < 0) {
                // Assuming a sign bit, this might need adjustment based on actual protocol
                byteValue |= 0x40; // Example: setting a sign bit
            }
            encodedBytes = [byteValue];
            break;
        case 'none':
        default:
          // Generic number to byte array conversion
          for (let i = 0; i < length; i++) {
            encodedBytes.unshift(numValue & 0xFF);
            numValue >>= 8;
          }
          break;
      }
    }

    if (endian === 'little') {
      encodedBytes.reverse();
    }

    return encodedBytes;
  }


  // --- Packet Construction ---
  public constructCommandPacket(
    entity: EntityConfig,
    commandName: string, // e.g., 'command_on', 'command_off', 'command_press', 'command_temperature'
    value?: number | string // Value for commands like set_temperature, set_speed
  ): number[] | null {
    const deviceConfig = this.config.devices.find(d => d.entities.includes(entity));
    if (!deviceConfig) {
      console.error('Device config not found for entity:', entity);
      return null;
    }

    const packetDefaults = { ...this.config.packet_defaults, ...deviceConfig.packet_parameters, ...entity.packet_parameters };

    let commandSchema: CommandSchema | undefined;

    // Handle specific command types
    if (entity.type === 'light') {
      const lightEntity = entity as LightEntity;
      if (commandName === 'command_on') commandSchema = lightEntity.command_on;
      else if (commandName === 'command_off') commandSchema = lightEntity.command_off;
    } else if (entity.type === 'switch') {
      const switchEntity = entity as SwitchEntity;
      if (commandName === 'command_on') commandSchema = switchEntity.command_on;
      else if (commandName === 'command_off') commandSchema = switchEntity.command_off;
    } else if (entity.type === 'valve') {
      const valveEntity = entity as ValveEntity;
      if (commandName === 'command_open') commandSchema = valveEntity.command_open;
      else if (commandName === 'command_close') commandSchema = valveEntity.command_close;
    } else if (entity.type === 'button') {
      const buttonEntity = entity as ButtonEntity;
      if (commandName === 'command_press') commandSchema = buttonEntity.command_press;
    } else if (entity.type === 'climate') {
      const climateEntity = entity as ClimateEntity;
      if (commandName === 'command_off') commandSchema = climateEntity.command_off;
      else if (commandName === 'command_heat') commandSchema = climateEntity.command_heat;
      else if (commandName === 'command_cool') commandSchema = climateEntity.command_cool;
      else if (commandName === 'command_temperature') commandSchema = climateEntity.command_temperature;
    } else if (entity.type === 'fan') {
        const fanEntity = entity as FanEntity;
        if (commandName === 'command_on') commandSchema = fanEntity.command_on;
        else if (commandName === 'command_off') commandSchema = fanEntity.command_off;
        else if (commandName === 'command_speed') {
            if (fanEntity.command_speed && fanEntity.command_speed.mapping && value !== undefined) {
                commandSchema = fanEntity.command_speed.mapping[value as number];
            } else if (fanEntity.command_speed && !fanEntity.command_speed.mapping) {
                commandSchema = fanEntity.command_speed;
            }
        }
    } else if (entity.type === 'sensor') {
        const sensorEntity = entity as SensorEntity;
        if (commandName === 'command_update') commandSchema = sensorEntity.command_update;
    }

    if (!commandSchema) {
      console.error(`Command schema not found for ${entity.type}.${commandName}`);
      return null;
    }

    let commandData = [...commandSchema.cmd];

    // Insert value if provided and schema supports it
    if (value !== undefined && commandSchema.value_offset !== undefined) {
      const encodedValue = this.encodeValue(value, commandSchema);
      commandData.splice(commandSchema.value_offset, encodedValue.length, ...encodedValue);
    }

    const txHeader = packetDefaults.tx_header || [];
    const txFooter = packetDefaults.tx_footer || [];
    const txChecksum = (packetDefaults.tx_checksum || 'none') as ChecksumType; // Cast to ChecksumType

    const checksumBytes = this.calculateChecksum(commandData, txChecksum, txHeader, txFooter);

    return [...txHeader, ...commandData, ...checksumBytes, ...txFooter];
  }

  // --- Packet Parsing ---
  public parseIncomingPacket(
    packet: number[],
    deviceEntities: EntityConfig[]
  ): { entityId: string; state: any }[] {
    const parsedStates: { entityId: string; state: any }[] = [];

    for (const entity of deviceEntities) {
      const deviceConfig = this.config.devices.find(d => d.entities.includes(entity));
      if (!deviceConfig) continue;

      const packetDefaults = { ...this.config.packet_defaults, ...deviceConfig.packet_parameters, ...entity.packet_parameters };

      const rxHeader = packetDefaults.rx_header || [];
      const rxFooter = packetDefaults.rx_footer || [];
      const rxChecksum = (packetDefaults.rx_checksum || 'none') as ChecksumType; // Cast to ChecksumType

      // Basic header check
      if (rxHeader.length > 0 && !this.startsWith(packet, rxHeader)) {
        continue;
      }

      // Remove header for checksum calculation and data extraction
      const dataWithoutHeader = packet.slice(rxHeader.length);

      // Basic footer check (if footer is defined)
      if (rxFooter.length > 0 && !this.endsWith(dataWithoutHeader, rxFooter)) {
        continue;
      }

      // Remove footer for checksum calculation and data extraction
      const dataWithoutHeaderAndFooter = rxFooter.length > 0 ? dataWithoutHeader.slice(0, -rxFooter.length) : dataWithoutHeader;

      // Checksum verification (if checksum is defined)
      if (rxChecksum !== 'none') {
        // This is more complex as checksum is usually at the end of data or before footer
        // For simplicity, let's assume checksum is the last byte before footer
        const expectedChecksumBytes = this.calculateChecksum(
            dataWithoutHeaderAndFooter.slice(0, -1), // Assuming last byte is checksum
            rxChecksum,
            rxHeader,
            [] // Footer already removed
        );
        if (expectedChecksumBytes.length > 0 && expectedChecksumBytes[0] !== dataWithoutHeaderAndFooter[dataWithoutHeaderAndFooter.length - 1]) {
            console.warn('Checksum mismatch for packet:', this.bytesToHex(packet));
            continue;
        }
        // Remove checksum byte from data for state extraction
        dataWithoutHeaderAndFooter.pop();
      }


      // --- State Extraction Logic ---
      let currentState: { [key: string]: any } = {};
      let matched = false;

      // Check specific states (on/off, heat/cool, etc.)
      if (entity.type === 'light') {
        const lightEntity = entity as LightEntity;
        if (lightEntity.state && this.matchState(dataWithoutHeaderAndFooter, lightEntity.state)) {
          matched = true;
        }
        if (lightEntity.state_on && this.matchState(dataWithoutHeaderAndFooter, lightEntity.state_on)) {
          currentState.isOn = true;
          matched = true;
        } else if (lightEntity.state_off && this.matchState(dataWithoutHeaderAndFooter, lightEntity.state_off)) {
          currentState.isOn = false;
          matched = true;
        }
      } else if (entity.type === 'switch') {
        const switchEntity = entity as SwitchEntity;
        if (switchEntity.state && this.matchState(dataWithoutHeaderAndFooter, switchEntity.state)) {
          matched = true;
        }
        if (switchEntity.state_on && this.matchState(dataWithoutHeaderAndFooter, switchEntity.state_on)) {
          currentState.isOn = true;
          matched = true;
        } else if (switchEntity.state_off && this.matchState(dataWithoutHeaderAndFooter, switchEntity.state_off)) {
          currentState.isOn = false;
          matched = true;
        }
      } else if (entity.type === 'valve') {
        const valveEntity = entity as ValveEntity;
        if (valveEntity.state && this.matchState(dataWithoutHeaderAndFooter, valveEntity.state)) {
          matched = true;
        }
        if (valveEntity.state_open && this.matchState(dataWithoutHeaderAndFooter, valveEntity.state_open)) {
            currentState.isOpen = true;
            matched = true;
        } else if (valveEntity.state_closed && this.matchState(dataWithoutHeaderAndFooter, valveEntity.state_closed)) {
            currentState.isOpen = false;
            matched = true;
        }
      } else if (entity.type === 'climate') {
        const climateEntity = entity as ClimateEntity;
        if (climateEntity.state && this.matchState(dataWithoutHeaderAndFooter, climateEntity.state)) {
          matched = true;
        }
        if (climateEntity.state_off && this.matchState(dataWithoutHeaderAndFooter, climateEntity.state_off)) {
          currentState.mode = 'off';
          matched = true;
        } else if (climateEntity.state_heat && this.matchState(dataWithoutHeaderAndFooter, climateEntity.state_heat)) {
          currentState.mode = 'heat';
          matched = true;
        } else if (climateEntity.state_cool && this.matchState(dataWithoutHeaderAndFooter, climateEntity.state_cool)) {
          currentState.mode = 'cool';
          matched = true;
        }
        if (climateEntity.state_temperature_current) {
          currentState.currentTemperature = this.decodeValue(dataWithoutHeaderAndFooter, climateEntity.state_temperature_current);
          matched = true;
        }
        if (climateEntity.state_temperature_target) {
          currentState.targetTemperature = this.decodeValue(dataWithoutHeaderAndFooter, climateEntity.state_temperature_target);
          matched = true;
        }
      } else if (entity.type === 'sensor') {
        const sensorEntity = entity as SensorEntity;
        if (sensorEntity.state && this.matchState(dataWithoutHeaderAndFooter, sensorEntity.state)) {
          matched = true;
        }
        if (sensorEntity.state_number) {
          currentState.value = this.decodeValue(dataWithoutHeaderAndFooter, sensorEntity.state_number);
          matched = true;
        }
      } else if (entity.type === 'fan') {
        const fanEntity = entity as FanEntity;
        if (fanEntity.state && this.matchState(dataWithoutHeaderAndFooter, fanEntity.state)) {
          matched = true;
        }
        if (fanEntity.state_on && this.matchState(dataWithoutHeaderAndFooter, fanEntity.state_on)) {
            currentState.isOn = true;
            matched = true;
        } else if (fanEntity.state_off && this.matchState(dataWithoutHeaderAndFooter, fanEntity.state_off)) {
            currentState.isOn = false;
            matched = true;
        }
        if (fanEntity.state_speed) {
            if (fanEntity.state_speed.mapping) { // Check if mapping is defined within StateNumSchema
                const byteValue = this.decodeValue(dataWithoutHeaderAndFooter, fanEntity.state_speed); // Decode the value first
                if (byteValue !== null && typeof byteValue === 'number' && fanEntity.state_speed.mapping[byteValue] !== undefined) {
                    currentState.speed = fanEntity.state_speed.mapping[byteValue];
                    matched = true;
                }
            } else {
                currentState.speed = this.decodeValue(dataWithoutHeaderAndFooter, fanEntity.state_speed);
                matched = true;
            }
        }
      } else if (entity.type === 'binary_sensor') {
        const binarySensorEntity = entity as BinarySensorEntity;
        if (binarySensorEntity.state && this.matchState(dataWithoutHeaderAndFooter, binarySensorEntity.state)) {
          matched = true;
        }
        if (binarySensorEntity.state_on && this.matchState(dataWithoutHeaderAndFooter, binarySensorEntity.state_on)) {
            currentState.isOn = true;
            matched = true;
        } else if (binarySensorEntity.state_off && this.matchState(dataWithoutHeaderAndFooter, binarySensorEntity.state_off)) {
            currentState.isOn = false;
            matched = true;
        }
      }


      if (matched) {
        parsedStates.push({ entityId: entity.id, state: currentState });
      }
    }

    return parsedStates;
  }

  private matchState(packetData: number[], stateSchema: StateSchema): boolean {
    const { data, mask, offset = 0, inverted = false } = stateSchema;

    if (!data || data.length === 0) {
      // If no data pattern is specified, consider it a match if other conditions are met
      return true;
    }

    if (offset + data.length > packetData.length) {
      return false; // Pattern extends beyond packet data
    }

    let isMatch = true;
    for (let i = 0; i < data.length; i++) {
      const packetByte = packetData[offset + i];
      const patternByte = data[i];
      let effectivePacketByte = packetByte;
      let effectivePatternByte = patternByte;

      if (mask) {
        const currentMask = Array.isArray(mask) ? mask[i] : mask;
        if (currentMask !== undefined) {
          effectivePacketByte = packetByte & currentMask;
          effectivePatternByte = patternByte & currentMask;
        }
      }

      if (effectivePacketByte !== effectivePatternByte) {
        isMatch = false;
        break;
      }
    }

    return inverted ? !isMatch : isMatch;
  }

  private startsWith(array: number[], prefix: number[]): boolean {
    if (prefix.length > array.length) {
      return false;
    }
    for (let i = 0; i < prefix.length; i++) {
      if (array[i] !== prefix[i]) {
        return false;
      }
    }
    return true;
  }

  private endsWith(array: number[], suffix: number[]): boolean {
    if (suffix.length > array.length) {
      return false;
    }
    for (let i = 0; i < suffix.length; i++) {
      if (array[array.length - suffix.length + i] !== suffix[i]) {
        return false;
      }
    }
    return true;
  }
}
