export type AgentApiDisabledReason = 'env_disabled' | 'no_token' | 'store_unavailable' | null;

export interface AgentApiStatus {
  enabled: boolean;
  ready: boolean;
  hasToken: boolean;
  allowPacketSend: boolean;
  port: number;
  actualPort: number | null;
  unavailable: boolean;
  disabledReason: AgentApiDisabledReason;
  portEditable: boolean;
}

export class AgentApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'AgentApiError';
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch {
    throw new AgentApiError('NETWORK_ERROR');
  }

  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    try {
      const data = (await response.json()) as { error?: unknown };
      if (typeof data.error === 'string') {
        code = data.error;
      }
    } catch {
      // Keep the HTTP status fallback when the body is not JSON.
    }
    throw new AgentApiError(code, response.status);
  }

  return (await response.json()) as T;
}

export function getAgentApiStatus(): Promise<AgentApiStatus> {
  return request<AgentApiStatus>('./api/agent-api');
}

export function issueAgentApiToken(): Promise<{ ok: boolean; rotated: boolean; token: string }> {
  return request<{ ok: boolean; rotated: boolean; token: string }>('./api/agent-api/token', {
    method: 'POST',
  });
}

/** Marks the first-run Agent API screen as shown so it is not repeated. */
export function ackAgentApiSetup(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('./api/agent-api/setup-ack', { method: 'POST' });
}

export function updateAgentApiSettings(payload: {
  port?: number;
  allowPacketSend?: boolean;
}): Promise<{ ok: boolean; restartRequired: boolean; port: number; allowPacketSend: boolean }> {
  return request<{
    ok: boolean;
    restartRequired: boolean;
    port: number;
    allowPacketSend: boolean;
  }>('./api/agent-api/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
