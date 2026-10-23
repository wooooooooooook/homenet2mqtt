import { createHash } from 'node:crypto';
import {
  DEFAULT_AGENT_API_PORT,
  type AgentApiDisabledReason,
  type AgentApiState,
} from '../../src/agent/agent-api.store.js';

/**
 * In-memory AgentApiState for route tests, so suites do not need a credential file.
 * Mirrors AgentApiStore's readiness rules exactly.
 */
export interface FakeAgentApiOptions {
  envEnabled?: boolean;
  token?: string | null;
  allowPacketSend?: boolean;
  port?: number;
  actualPort?: number | null;
  unavailable?: boolean;
}

export class FakeAgentApiState implements AgentApiState {
  private token: string | null;
  private allowPacketSend: boolean;
  private port: number;
  private actualPort: number | null;
  private unavailableState: boolean;

  constructor(private readonly options: FakeAgentApiOptions = {}) {
    this.token = options.token ?? null;
    this.allowPacketSend = options.allowPacketSend ?? false;
    this.port = options.port ?? DEFAULT_AGENT_API_PORT;
    this.actualPort = options.actualPort ?? null;
    this.unavailableState = options.unavailable ?? false;
  }

  isEnvEnabled(): boolean {
    return this.options.envEnabled ?? true;
  }

  hasToken(): boolean {
    return this.token !== null;
  }

  isReady(): boolean {
    return this.isEnvEnabled() && !this.unavailableState && this.hasToken();
  }

  unavailable(): boolean {
    return this.unavailableState;
  }

  disabledReason(): AgentApiDisabledReason {
    if (!this.isEnvEnabled()) return 'env_disabled';
    if (this.unavailableState) return 'store_unavailable';
    if (!this.hasToken()) return 'no_token';
    return null;
  }

  getTokenHash(): Buffer | null {
    if (this.unavailableState || !this.token) return null;
    return createHash('sha256').update(this.token, 'utf8').digest();
  }

  getAllowPacketSend(): boolean {
    return this.allowPacketSend;
  }

  getDesiredPort(): number {
    return this.port;
  }

  getActualPort(): number | null {
    return this.actualPort;
  }

  rotateToken(token: string | null): void {
    this.token = token;
  }

  setAllowPacketSend(allow: boolean): void {
    this.allowPacketSend = allow;
  }
}

export const createFakeAgentApiState = (options: FakeAgentApiOptions = {}) =>
  new FakeAgentApiState(options);
