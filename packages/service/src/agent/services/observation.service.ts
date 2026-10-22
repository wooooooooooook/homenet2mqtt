import { normalizePortId } from '@rs485-homenet/core';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import { BASE_MQTT_PREFIX, ENTITY_TYPE_KEYS } from '../../utils/constants.js';
import type { ConfigStatus, StateChangeEvent } from '../../types/index.js';
import type { LogRetentionService, UnmatchedPacketDetail } from '../../log-retention.service.js';

export interface AgentPortListInput {
  configs: HomenetBridgeConfig[];
  configFiles: string[];
  statuses: ConfigStatus[];
}

export interface AgentPortSummary {
  index: number;
  portId: string;
  configFile: string | null;
  status: ConfigStatus;
  topicPrefix: string;
  serial: {
    path: string;
    baudRate: number;
    dataBits: number;
    parity: string;
    stopBits: number;
    serialIdle?: number | string;
  } | null;
  packetDefaults: Record<string, unknown> | null;
  entityCounts: Record<string, number>;
}

export interface AgentEntitySummary {
  portId: string;
  entityType: string;
  id: string;
  name: string | null;
  config: Record<string, unknown>;
}

export interface AgentStateEntry {
  entityId: string;
  portId: string | null;
  topic: string;
  payload: string;
  state: Record<string, unknown>;
  timestamp: string;
}

export interface AgentPacketHistoryEntry {
  type: 'parsed' | 'command';
  packet: string;
  entityId: string;
  command?: string;
  value?: unknown;
  state?: unknown;
  timestamp: string;
  portId?: string;
}

export const resolveConfigPortId = (config: HomenetBridgeConfig, index: number): string =>
  normalizePortId(config.serial?.portId, index);

export function listAgentPorts(input: AgentPortListInput): AgentPortSummary[] {
  return input.configs.map((config, index) => {
    const portId = resolveConfigPortId(config, index);
    const serial = config.serial;
    const entityCounts: Record<string, number> = {};

    for (const type of ENTITY_TYPE_KEYS) {
      const list = (config as unknown as Record<string, unknown>)[String(type)];
      if (Array.isArray(list)) {
        entityCounts[String(type)] = list.length;
      }
    }

    return {
      index,
      portId,
      configFile: input.configFiles[index] ?? null,
      status: input.statuses[index] ?? 'idle',
      topicPrefix: `${BASE_MQTT_PREFIX}/${portId}`,
      serial: serial
        ? {
            path: serial.path,
            baudRate: serial.baud_rate,
            dataBits: serial.data_bits,
            parity: serial.parity,
            stopBits: serial.stop_bits,
            serialIdle: serial.serial_idle,
          }
        : null,
      packetDefaults: config.packet_defaults
        ? (config.packet_defaults as Record<string, unknown>)
        : null,
      entityCounts,
    };
  });
}

export function listAgentEntities(
  configs: HomenetBridgeConfig[],
  portId?: string,
): AgentEntitySummary[] {
  const entities: AgentEntitySummary[] = [];

  configs.forEach((config, index) => {
    const configPortId = resolveConfigPortId(config, index);
    if (portId && configPortId !== portId) return;

    for (const type of ENTITY_TYPE_KEYS) {
      const list = (config as unknown as Record<string, unknown>)[String(type)];
      if (!Array.isArray(list)) continue;

      for (const entity of list) {
        if (!entity || typeof entity !== 'object') continue;
        const record = entity as Record<string, unknown>;
        if (typeof record.id !== 'string' || !record.id) continue;

        entities.push({
          portId: configPortId,
          entityType: String(type),
          id: record.id,
          name: typeof record.name === 'string' ? record.name : null,
          config: record,
        });
      }
    }
  });

  return entities;
}

export function findAgentEntity(
  configs: HomenetBridgeConfig[],
  entityId: string,
  portId?: string,
): AgentEntitySummary | undefined {
  return listAgentEntities(configs, portId).find((entity) => entity.id === entityId);
}

export function listAgentStates(
  latestStates: Map<string, StateChangeEvent>,
  portId?: string,
): AgentStateEntry[] {
  const states: AgentStateEntry[] = [];

  for (const event of latestStates.values()) {
    if (portId && event.portId !== portId) continue;
    states.push({
      entityId: event.entityId,
      portId: event.portId ?? null,
      topic: event.topic,
      payload: event.payload,
      state: event.state,
      timestamp: event.timestamp,
    });
  }

  return states.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export interface PacketHistoryQuery {
  portId?: string;
  limit?: number;
  since?: string | number;
}

export const AGENT_PACKET_HISTORY_DEFAULT_LIMIT = 200;
export const AGENT_PACKET_HISTORY_MAX_LIMIT = 1000;

const toTimestamp = (value: string): number => {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export function listAgentPacketHistory(
  logRetentionService: LogRetentionService,
  query: PacketHistoryQuery = {},
): AgentPacketHistoryEntry[] {
  const dictionary = logRetentionService.getPacketDictionary();
  const entries: AgentPacketHistoryEntry[] = [];

  for (const log of logRetentionService.getParsedPacketHistoryRaw()) {
    if (query.portId && log.portId !== query.portId) continue;
    entries.push({
      type: 'parsed',
      packet: dictionary[log.packetId] ?? '',
      entityId: log.entityId,
      state: log.state,
      timestamp: log.timestamp,
      portId: log.portId,
    });
  }

  for (const log of logRetentionService.getCommandPacketHistoryRaw()) {
    if (query.portId && log.portId !== query.portId) continue;
    entries.push({
      type: 'command',
      packet: dictionary[log.packetId] ?? '',
      entityId: log.entityId,
      command: log.command,
      value: log.value,
      timestamp: log.timestamp,
      portId: log.portId,
    });
  }

  entries.sort((a, b) => toTimestamp(a.timestamp) - toTimestamp(b.timestamp));

  const sinceTime =
    query.since !== undefined ? new Date(query.since).getTime() : Number.NEGATIVE_INFINITY;
  const filtered = Number.isNaN(sinceTime)
    ? entries
    : entries.filter((entry) => toTimestamp(entry.timestamp) >= sinceTime);

  if (query.limit !== undefined && query.limit > 0) {
    return filtered.slice(-query.limit);
  }

  return filtered;
}

export function listAgentUnmatchedPackets(
  logRetentionService: LogRetentionService,
  portId?: string,
): UnmatchedPacketDetail[] {
  return logRetentionService.getUnmatchedPacketDetails(portId);
}
