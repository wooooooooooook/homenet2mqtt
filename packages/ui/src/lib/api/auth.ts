export interface UiAuthStatus {
  authEnabled: boolean;
  configured: boolean;
  authenticated: boolean;
  ingress: boolean;
  unavailable: boolean;
  setupExpired: boolean;
  agentApi?: {
    enabled: boolean;
    portEditable: boolean;
  };
}

export interface SetupAgentApiPayload {
  generateToken: boolean;
  port?: number | null;
  allowPacketSend?: boolean | null;
}

export class UiAuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'UiAuthError';
  }
}

async function authRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
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
    throw new UiAuthError('NETWORK_ERROR');
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
    throw new UiAuthError(code, response.status);
  }

  return (await response.json()) as T;
}

export function getUiAuthStatus(): Promise<UiAuthStatus> {
  return authRequest<UiAuthStatus>('./api/auth/status');
}

export function setupUiPassword(
  password: string,
  agentApi?: SetupAgentApiPayload,
): Promise<{ ok: boolean; agentToken: string | null }> {
  return authRequest<{ ok: boolean; agentToken: string | null }>('./api/auth/setup', {
    method: 'POST',
    body: JSON.stringify(agentApi ? { password, agentApi } : { password }),
  });
}

export function loginUi(password: string): Promise<{ ok: boolean }> {
  return authRequest<{ ok: boolean }>('./api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function logoutUi(): Promise<{ ok: boolean }> {
  return authRequest<{ ok: boolean }>('./api/auth/logout', {
    method: 'POST',
  });
}

export function changeUiPassword(
  currentPassword: string | undefined,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return authRequest<{ ok: boolean }>('./api/auth/password', {
    method: 'POST',
    body: JSON.stringify({
      ...(currentPassword !== undefined ? { currentPassword } : {}),
      newPassword,
    }),
  });
}
