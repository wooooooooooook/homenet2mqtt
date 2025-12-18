import { EventEmitter } from 'events';

export interface MqttMessageEvent {
  topic: string;
  payload: string;
  portId?: string;
}

export interface StateChangedEvent {
  portId: string;
  entityId: string;
  topic: string;
  payload: string;
  state: Record<string, any>;
  oldState: Record<string, any>;
  changes: Record<string, any>;
  timestamp: string;
}

export const eventBus = new EventEmitter();
