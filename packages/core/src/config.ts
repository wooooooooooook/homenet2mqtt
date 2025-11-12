// packages/core/src/config.ts

export type ChecksumType = 'add' | 'xor' | 'add_no_header' | 'xor_no_header' | 'custom' | 'none';
export type ParityType = 'none' | 'even' | 'odd';
export type EndianType = 'big' | 'little';
export type DecodeEncodeType = 'none' | 'bcd' | 'ascii' | 'signed_byte_half_degree';

export interface SerialConfig {
  baud_rate: number;
  data_bits: 8 | 7 | 6 | 5;
  parity: ParityType;
  stop_bits: 1 | 2;
}

export interface PacketDefaults {
  rx_timeout?: string; // e.g., "10ms"
  tx_delay?: string;   // e.g., "50ms"
  tx_timeout?: string; // e.g., "500ms"
  tx_retry_cnt?: number;
  rx_header?: number[];
  rx_footer?: number[];
  tx_header?: number[];
  tx_footer?: number[];
  rx_checksum?: ChecksumType | { type: 'custom', algorithm: string }; // algorithm would describe the custom logic
  tx_checksum?: ChecksumType | { type: 'custom', algorithm: string }; // algorithm would describe the custom logic
}

export interface StateSchema {
  data?: number[]; // Byte pattern to match
  mask?: number | number[]; // Mask to apply to data
  offset?: number; // Starting offset within packet data
  inverted?: boolean;
}

export interface StateNumSchema {
  offset: number;
  length?: number;
  precision?: number;
  signed?: boolean;
  endian?: EndianType;
  decode?: DecodeEncodeType;
  mapping?: { [byteValue: number]: number }; // Added mapping as an optional property
}

export interface CommandSchema {
  cmd: number[]; // Byte pattern for the command
  ack?: number[]; // Expected ACK packet data
  mask?: number | number[]; // Mask to apply to cmd
  value_offset?: number; // Offset for value insertion in command
  value_encode?: DecodeEncodeType; // Encoding for the value
  length?: number; // Length of the value in bytes, needed for encoding
  signed?: boolean; // Whether the value is signed, needed for encoding
  endian?: EndianType; // Byte order for the value, needed for encoding
}

export interface EntityPacketParameters extends PacketDefaults {
  // Entity-specific overrides for packet defaults
}

export interface LightEntity {
  type: 'light';
  id: string;
  name: string;
  packet_parameters?: EntityPacketParameters;
  state?: StateSchema;
  state_on: StateSchema;
  state_off: StateSchema;
  command_on: CommandSchema;
  command_off: CommandSchema;
  state_brightness?: StateNumSchema;
  command_brightness?: CommandSchema;
  command_update?: CommandSchema;
}

export interface ClimateEntity {
  type: 'climate';
  id: string;
  name: string;
  packet_parameters?: EntityPacketParameters;
  visual?: {
    min_temperature?: number;
    max_temperature?: number;
    temperature_step?: number;
  };
  state?: StateSchema;
  state_temperature_current?: StateNumSchema;
  state_temperature_target?: StateNumSchema;
  state_off: StateSchema;
  state_heat?: StateSchema;
  state_cool?: StateSchema;
  command_off?: CommandSchema;
  command_heat?: CommandSchema;
  command_cool?: CommandSchema;
  command_temperature?: CommandSchema;
  command_update?: CommandSchema;
}

export interface ValveEntity {
  type: 'valve';
  id: string;
  name: string;
  packet_parameters?: EntityPacketParameters;
  state?: StateSchema;
  state_open: StateSchema;
  state_closed: StateSchema;
  command_open?: CommandSchema;
  command_close?: CommandSchema;
  command_update?: CommandSchema;
}

export interface ButtonEntity {
  type: 'button';
  id: string;
  name: string;
  packet_parameters?: EntityPacketParameters;
  command_press: CommandSchema;
}

export interface SensorEntity {
  type: 'sensor';
  id: string;
  name: string;
  packet_parameters?: EntityPacketParameters;
  state?: StateSchema;
  state_number?: StateNumSchema;
  command_update?: CommandSchema;
}

export interface FanEntity {
  type: 'fan';
  id: string;
  name: string;
  packet_parameters?: EntityPacketParameters;
  state?: StateSchema;
  state_on: StateSchema;
  state_off: StateSchema;
  command_on: CommandSchema;
  command_off: CommandSchema;
  command_speed?: CommandSchema & { mapping?: { [speed: number]: CommandSchema } }; // CommandSchema with optional mapping
  state_speed?: StateNumSchema; // Now StateNumSchema can have mapping
  command_update?: CommandSchema;
}

export interface SwitchEntity {
  type: 'switch';
  id: string;
  name: string;
  packet_parameters?: EntityPacketParameters;
  state?: StateSchema;
  state_on: StateSchema;
  state_off: StateSchema;
  command_on: CommandSchema;
  command_off: CommandSchema;
  command_update?: CommandSchema;
}

export interface BinarySensorEntity {
  type: 'binary_sensor';
  id: string;
  name: string;
  packet_parameters?: EntityPacketParameters;
  state?: StateSchema;
  state_on: StateSchema;
  state_off: StateSchema;
  command_update?: CommandSchema;
}

export type EntityConfig = LightEntity | ClimateEntity | ValveEntity | ButtonEntity | SensorEntity | FanEntity | SwitchEntity | BinarySensorEntity;

export interface DeviceConfig {
  name: string;
  packet_parameters?: EntityPacketParameters; // Device-specific overrides
  entities: EntityConfig[];
}

export interface HomenetBridgeConfig {
  serial: SerialConfig;
  packet_defaults?: PacketDefaults;
  devices: DeviceConfig[];
}