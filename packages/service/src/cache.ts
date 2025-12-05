import { EventEmitter } from 'events';

export interface MqttMessageEvent {
  topic: string;
  payload: string;
  receivedAt: string;
}

export interface RawPacketWithInterval {
  topic: string;
  payload: string;
  interval: number | null;
  receivedAt: string;
}

export interface CommandPacket {
  [key: string]: unknown;
}

export interface PacketStats {
  [key: string]: unknown;
}

type RawPacketEventPayload = {
  payload?: string;
  interval?: number | null;
  receivedAt?: string;
};

export class PacketCache {
  private mqttState = new Map<string, MqttMessageEvent>();
  private rawPackets: RawPacketWithInterval[] = [];
  private commandPackets: CommandPacket[] = [];
  private packetStats: PacketStats | null = null;

  private readonly MAX_RAW_PACKETS = 1000;
  private readonly MAX_COMMAND_PACKETS = 200;

  constructor(private eventBus: EventEmitter) {
    this.setupListeners();
  }

  private setupListeners() {
    this.eventBus.on('mqtt-message', (data: { topic: string; payload: string }) => {
      const event: MqttMessageEvent = {
        topic: data.topic,
        payload: data.payload,
        receivedAt: new Date().toISOString(),
      };
      this.mqttState.set(data.topic, event);
    });

    this.eventBus.on('raw-data-with-interval', (data: RawPacketEventPayload) => {
      const packet: RawPacketWithInterval = {
        topic: 'homenet/raw',
        payload: typeof data.payload === 'string' ? data.payload : '',
        interval: typeof data.interval === 'number' ? data.interval : null,
        receivedAt: data.receivedAt ?? new Date().toISOString(),
      };
      this.rawPackets.push(packet);
      if (this.rawPackets.length > this.MAX_RAW_PACKETS) {
        this.rawPackets.shift();
      }
    });

    this.eventBus.on('command-packet', (data: CommandPacket) => {
      this.commandPackets.push(data);
      if (this.commandPackets.length > this.MAX_COMMAND_PACKETS) {
        this.commandPackets.shift();
      }
    });

    this.eventBus.on('packet-interval-stats', (data: PacketStats) => {
      this.packetStats = data;
    });
  }

  public getInitialState() {
    return {
      mqttState: Array.from(this.mqttState.values()),
      rawPackets: this.rawPackets,
      commandPackets: this.commandPackets,
      // Deep copy packetStats to prevent reference issues
      packetStats: this.packetStats ? { ...this.packetStats } : null,
    };
  }
}
