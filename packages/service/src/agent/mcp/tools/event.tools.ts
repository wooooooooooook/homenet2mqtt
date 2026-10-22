import type { AgentEventFilter, AgentEventType } from '../../agent-events.service.js';
import { AGENT_EVENT_TYPES } from '../../agent-events.service.js';
import { ConfigItemsError } from '../../../services/config-items.service.js';
import type { McpTool } from '../types.js';
import { readIntegerArg, readStringArg } from './args.js';

const MAX_EVENTS = 500;
const DEFAULT_EVENTS = 100;

const readEventTypes = (value: unknown): Set<AgentEventType> | undefined => {
  if (value === undefined) return undefined;

  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : null;
  if (!entries) {
    throw new ConfigItemsError(
      'INVALID_EVENT_TYPE',
      'types must be a comma-separated string or an array of strings.',
      400,
    );
  }

  const normalized = entries
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
  const invalid = normalized.filter(
    (entry) => !AGENT_EVENT_TYPES.includes(entry as AgentEventType),
  );
  if (invalid.length > 0) {
    throw new ConfigItemsError(
      'INVALID_EVENT_TYPE',
      `Unknown event type(s): ${invalid.join(', ')}.`,
      400,
      { allowed: AGENT_EVENT_TYPES },
    );
  }

  return new Set(normalized as AgentEventType[]);
};

export const eventTools: McpTool[] = [
  {
    name: 'get_recent_events',
    title: 'Poll recent agent events',
    description:
      'Poll events buffered by the agent event hub. Pass afterId with the last seen event id to fetch only newer events. The buffer holds the most recent 500 events.',
    inputSchema: {
      type: 'object',
      properties: {
        afterId: {
          type: 'integer',
          minimum: 0,
          default: 0,
          description: 'Return only events with an id greater than this value.',
        },
        limit: { type: 'integer', minimum: 1, maximum: MAX_EVENTS, default: DEFAULT_EVENTS },
        types: {
          oneOf: [
            { type: 'string', description: 'Comma-separated event types.' },
            { type: 'array', items: { type: 'string', enum: AGENT_EVENT_TYPES } },
          ],
        },
        portId: { type: 'string' },
        rawMode: { type: 'string', enum: ['all', 'valid'] },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: (ctx, args) => {
      const afterId = readIntegerArg(args, 'afterId', 0);
      const limit = Math.min(
        Math.max(readIntegerArg(args, 'limit', DEFAULT_EVENTS), 1),
        MAX_EVENTS,
      );
      const portId = readStringArg(args, 'portId');
      const rawMode =
        args.rawMode === 'valid' ? 'valid' : args.rawMode === 'all' ? 'all' : undefined;

      const filter: AgentEventFilter = {
        types: readEventTypes(args.types),
        portId,
        rawMode,
      };

      let events;
      let gap = false;
      if (afterId > 0) {
        const replay = ctx.agentEventHub.replayAfter(afterId, filter);
        events = replay.events.slice(0, limit);
        gap = replay.gap;
      } else {
        events = ctx.agentEventHub.getRecent(limit, filter);
      }

      return {
        data: {
          events,
          lastEventId: events.length > 0 ? events[events.length - 1].id : afterId || null,
          oldestEventId: ctx.agentEventHub.getOldestEventId(),
          gap,
        },
      };
    },
  },
];
