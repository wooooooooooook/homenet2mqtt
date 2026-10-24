export const AGENT_API_BASE = '/api/v1/agent';

export const AGENT_PATHS = {
  openapi: '/openapi.json',
  llms: '/llms.txt',
  capabilities: '/capabilities',
  setup: '/setup',
  setupExample: '/setup/examples/:filename',
  setupTestSerial: '/setup/test-serial',
  setupApply: '/setup/apply',
  ports: '/ports',
  entities: '/entities',
  entity: '/entities/:entityId',
  automations: '/automations',
  automation: '/automations/:automationId',
  scripts: '/scripts',
  script: '/scripts/:scriptId',
  state: '/state',
  packetHistory: '/packets/history',
  packetUnmatched: '/packets/unmatched',
  packetAnalyze: '/packets/analyze',
  packetPreview: '/packets/preview',
  packetSend: '/packets/send',
  capture: '/capture',
  captureStart: '/capture/start',
  captureStop: '/capture/stop',
  captureFiles: '/capture/files',
  captureFile: '/capture/files/:filename',
  gallery: '/gallery',
  gallerySnippet: '/gallery/snippet',
  galleryMatch: '/gallery/match',
  galleryExpand: '/gallery/expand',
  schema: '/schema',
  schemaFile: '/schema/:schemaName',
  events: '/events',
  entitiesValidate: '/entities/validate',
  entitiesApply: '/entities/apply',
  mcp: '/mcp',
} as const;

export type AgentPathKey = keyof typeof AGENT_PATHS;

export const toAgentUrl = (pathKey: AgentPathKey): string =>
  `${AGENT_API_BASE}${AGENT_PATHS[pathKey]}`;
