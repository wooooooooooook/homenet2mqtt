import { eventBus, logger } from '@rs485-homenet/core';
import { normalizeRawPacket } from '../utils/helpers.js';

export type AgentEventType =
  | 'state'
  | 'parsed-packet'
  | 'unmatched-packet'
  | 'command-packet'
  | 'bridge-status'
  | 'raw';

export const AGENT_EVENT_TYPES: AgentEventType[] = [
  'state',
  'parsed-packet',
  'unmatched-packet',
  'command-packet',
  'bridge-status',
  'raw',
];

export interface AgentEvent {
  id: number;
  type: AgentEventType;
  timestamp: string;
  portId: string | null;
  data: Record<string, unknown>;
}

export interface AgentEventFilter {
  types?: Set<AgentEventType>;
  portId?: string;
  rawMode?: 'all' | 'valid';
}

export interface AgentEventSubscriber {
  filter: AgentEventFilter;
  listener: (event: AgentEvent) => void;
}

const DEFAULT_BUFFER_SIZE = 500;

const resolveTimestamp = (data: unknown): string => {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const candidate = record.timestamp ?? record.receivedAt;
    if (typeof candidate === 'string') return candidate;
  }
  return new Date().toISOString();
};

const resolvePortId = (data: unknown): string | null => {
  if (data && typeof data === 'object') {
    const portId = (data as Record<string, unknown>).portId;
    if (typeof portId === 'string' && portId) return portId;
  }
  return null;
};

export function matchesAgentEventFilter(event: AgentEvent, filter: AgentEventFilter): boolean {
  if (filter.types && !filter.types.has(event.type)) return false;
  if (filter.portId && event.portId !== filter.portId) return false;

  if (event.type === 'raw' && filter.rawMode) {
    const mode = event.data.mode;
    if (mode !== null) {
      if (filter.rawMode === 'all' && mode !== 'all') return false;
      if (filter.rawMode === 'valid' && mode !== 'valid') return false;
    }
  }

  return true;
}

export class AgentEventHub {
  private readonly events: AgentEvent[] = [];
  private readonly subscribers = new Set<AgentEventSubscriber>();
  private readonly handlers: Array<{ event: string; handler: (data: unknown) => void }> = [];
  private nextId = 1;
  private started = false;

  constructor(private readonly bufferSize = DEFAULT_BUFFER_SIZE) {}

  public start(): void {
    if (this.started) return;
    this.started = true;

    this.registerHandler('state:changed', (data) => this.publish('state', data));
    this.registerHandler('parsed-packet', (data) => this.publish('parsed-packet', data));
    this.registerHandler('unmatched-packet', (data) => this.publish('unmatched-packet', data));
    this.registerHandler('command-packet', (data) => this.publish('command-packet', data));
    this.registerHandler('bridge:status', (data) => this.publish('bridge-status', data));

    this.registerHandler('raw-data-with-interval', (data) => this.publishRaw(data, 'all', 'RX'));
    this.registerHandler('raw-valid-packet', (data) => this.publishRaw(data, 'valid', 'RX'));
    this.registerHandler('raw-tx-packet', (data) => this.publishRaw(data, null, 'TX'));

    logger.info('[agent-events] Event hub started');
  }

  public stop(): void {
    if (!this.started) return;
    for (const { event, handler } of this.handlers) {
      eventBus.off(event, handler);
    }
    this.handlers.length = 0;
    this.subscribers.clear();
    this.events.length = 0;
    this.started = false;
    logger.info('[agent-events] Event hub stopped');
  }

  public subscribe(filter: AgentEventFilter, listener: (event: AgentEvent) => void): () => void {
    const subscriber: AgentEventSubscriber = { filter, listener };
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  public getSubscriberCount(): number {
    return this.subscribers.size;
  }

  public getBufferSize(): number {
    return this.events.length;
  }

  public getOldestEventId(): number | null {
    return this.events.length > 0 ? this.events[0].id : null;
  }

  public replayAfter(
    afterId: number,
    filter: AgentEventFilter,
  ): { events: AgentEvent[]; gap: boolean } {
    const oldestId = this.getOldestEventId();
    const gap = oldestId !== null && afterId > 0 && afterId < oldestId - 1;

    return {
      events: this.events.filter(
        (event) => event.id > afterId && matchesAgentEventFilter(event, filter),
      ),
      gap,
    };
  }

  public getRecent(count: number, filter: AgentEventFilter = {}): AgentEvent[] {
    return this.events.filter((event) => matchesAgentEventFilter(event, filter)).slice(-count);
  }

  private registerHandler(event: string, handler: (data: unknown) => void): void {
    eventBus.on(event, handler);
    this.handlers.push({ event, handler });
  }

  private publishRaw(data: unknown, mode: 'all' | 'valid' | null, direction: 'RX' | 'TX'): void {
    const normalized = normalizeRawPacket((data as any) ?? {});
    this.publish('raw', {
      ...normalized,
      direction,
      mode,
    });
  }

  private publish(type: AgentEventType, data: unknown): void {
    const payload =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : { value: data };
    const event: AgentEvent = {
      id: this.nextId++,
      type,
      timestamp: resolveTimestamp(data),
      portId: resolvePortId(data),
      data: payload,
    };

    this.events.push(event);
    if (this.events.length > this.bufferSize) {
      this.events.splice(0, this.events.length - this.bufferSize);
    }

    for (const subscriber of this.subscribers) {
      if (!matchesAgentEventFilter(event, subscriber.filter)) continue;
      try {
        subscriber.listener(event);
      } catch (error) {
        logger.warn({ err: error }, '[agent-events] Subscriber failed to handle event');
      }
    }
  }
}
