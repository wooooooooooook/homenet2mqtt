<script lang="ts">
  import { t } from 'svelte-i18n';
  import Button from './Button.svelte';
  import { UiAuthError, loginUi, setupUiPassword } from '../api/auth';
  import {
    AgentApiError,
    ackAgentApiSetup,
    issueAgentApiToken,
    updateAgentApiSettings,
  } from '../api/agent-api';
  import { copyToClipboard } from '../utils/clipboard';

  let {
    mode,
    agentApi = { enabled: false, portEditable: true },
    onSuccess,
  }: {
    mode: 'setup' | 'login' | 'unavailable' | 'expired' | 'agent-setup';
    agentApi?: { enabled: boolean; portEditable: boolean };
    onSuccess: () => void;
  } = $props();

  const MIN_LENGTH = 8;
  const MAX_LENGTH = 1024;
  const PASSWORD_RESET_DOC_URL =
    'https://homenet2mqtt-docs.vercel.app/guide/troubleshooting.html#ui-password-reset';
  const AGENT_API_DOC_URL = 'https://homenet2mqtt-docs.vercel.app/guide/agent-api.html';

  let password = $state('');
  let confirmPassword = $state('');
  let submitting = $state(false);
  let errorKey = $state<string | null>(null);
  let issueToken = $state(true);
  let allowPacketSend = $state(false);
  let portInput = $state('3001');
  let issuedToken = $state<string | null>(null);
  let copied = $state(false);

  const parsedPort = $derived(Number(portInput));
  const portValid = $derived(
    Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535,
  );

  function resolveErrorKey(err: unknown): string {
    if (err instanceof AgentApiError) {
      switch (err.code) {
        case 'AGENT_API_UNAVAILABLE':
          return 'settings.agent_api.errors.unavailable';
        case 'RATE_LIMITED':
          return 'auth.errors.rate_limited';
        case 'NETWORK_ERROR':
          return 'auth.errors.network';
        default:
          return 'auth.errors.unknown';
      }
    }
    if (err instanceof UiAuthError) {
      switch (err.code) {
        case 'INVALID_PASSWORD':
          return 'auth.errors.invalid_password';
        case 'INVALID_NEW_PASSWORD':
          return 'auth.errors.invalid_new_password';
        case 'RATE_LIMITED':
          return 'auth.errors.rate_limited';
        case 'UI_PASSWORD_ALREADY_CONFIGURED':
          return 'auth.errors.already_configured';
        case 'UI_SETUP_EXPIRED':
          return 'auth.errors.setup_expired';
        case 'INVALID_PORT':
          return 'auth.errors.invalid_port';
        case 'PORT_CONFLICT':
          return 'auth.errors.port_conflict';
        case 'PORT_MANAGED_BY_ADDON':
          return 'auth.errors.port_managed_by_addon';
        case 'NETWORK_ERROR':
          return 'auth.errors.network';
        default:
          return 'auth.errors.unknown';
      }
    }
    return 'auth.errors.unknown';
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    errorKey = null;

    if (mode === 'setup') {
      if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
        errorKey = 'auth.errors.password_length';
        return;
      }
      if (password !== confirmPassword) {
        errorKey = 'auth.errors.password_mismatch';
        return;
      }
      if (agentApi.portEditable && !portValid) {
        errorKey = 'auth.errors.invalid_port';
        return;
      }
    } else if (mode === 'login' && password.length === 0) {
      errorKey = 'auth.errors.invalid_password';
      return;
    }

    submitting = true;
    try {
      if (mode === 'setup') {
        const result = await setupUiPassword(password, {
          generateToken: issueToken,
          ...(agentApi.portEditable ? { port: parsedPort } : {}),
          allowPacketSend,
        });
        if (result.agentToken) {
          issuedToken = result.agentToken;
          return;
        }
      } else if (mode === 'agent-setup') {
        // The add-on has no first-run password screen, so the Agent API options are
        // applied directly through the settings endpoints here.
        if (agentApi.enabled) {
          if (allowPacketSend) await updateAgentApiSettings({ allowPacketSend: true });
          if (issueToken) {
            const result = await issueAgentApiToken();
            issuedToken = result.token;
          }
        }
        await ackAgentApiSetup();
        if (!issuedToken) onSuccess();
        return;
      } else {
        await loginUi(password);
      }
      onSuccess();
    } catch (err) {
      errorKey = resolveErrorKey(err);
    } finally {
      submitting = false;
    }
  }

  async function handleCopyToken() {
    if (!issuedToken) return;
    copied = await copyToClipboard(issuedToken);
  }
</script>

<div class="auth-gate">
  <div class="auth-card">
    <div class="brand">Homenet2MQTT</div>

    {#if issuedToken}
      <h1>{$t('auth.setup.token_title')}</h1>
      <p class="desc">{$t('auth.setup.token_desc')}</p>
      <pre class="token">{issuedToken}</pre>
      <div class="token-actions">
        <Button variant="secondary" onclick={handleCopyToken}>
          {$t(copied ? 'auth.setup.token_copied' : 'auth.setup.token_copy')}
        </Button>
        <Button variant="primary" onclick={onSuccess}>{$t('auth.setup.continue')}</Button>
      </div>
      <p class="hint">{$t('auth.setup.token_once_hint')}</p>
    {:else}
      <h1>
        {#if mode === 'setup'}
          {$t('auth.setup.title')}
        {:else if mode === 'agent-setup'}
          {$t('auth.agent_setup.title')}
        {:else if mode === 'login'}
          {$t('auth.login.title')}
        {:else if mode === 'unavailable'}
          {$t('auth.unavailable.title')}
        {:else}
          {$t('auth.expired.title')}
        {/if}
      </h1>
      <p class="desc">
        {#if mode === 'setup'}
          {$t('auth.setup.desc')}
        {:else if mode === 'agent-setup'}
          {$t(agentApi.enabled ? 'auth.agent_setup.desc' : 'auth.agent_setup.disabled_desc')}
        {:else if mode === 'login'}
          {$t('auth.login.desc')}
        {:else if mode === 'unavailable'}
          {$t('auth.unavailable.desc')}
        {:else}
          {$t('auth.expired.desc')}
        {/if}
      </p>

      {#if mode === 'unavailable' || mode === 'expired'}
        <p class="help">
          <a href={PASSWORD_RESET_DOC_URL} target="_blank" rel="noopener noreferrer">
            {$t(mode === 'unavailable' ? 'auth.unavailable.docs' : 'auth.expired.docs')}
          </a>
        </p>
      {:else}
        <form onsubmit={handleSubmit}>
          {#if mode === 'setup' || mode === 'login'}
            <label class="field">
              <span>{$t('auth.password')}</span>
              <input
                type="password"
                bind:value={password}
                autocomplete={mode === 'setup' ? 'new-password' : 'current-password'}
                disabled={submitting}
              />
            </label>
          {/if}

          {#if mode === 'setup'}
            <label class="field">
              <span>{$t('auth.confirm_password')}</span>
              <input
                type="password"
                bind:value={confirmPassword}
                autocomplete="new-password"
                disabled={submitting}
              />
            </label>
            <p class="hint">{$t('auth.setup.hint')}</p>
          {/if}

          {#if mode === 'setup' || mode === 'agent-setup'}
            {#if mode === 'agent-setup' && !agentApi.enabled}
              <div class="notice">
                <ol class="steps">
                  <li>{$t('auth.agent_setup.step_enable')}</li>
                  {#if !agentApi.portEditable}
                    <li>{$t('auth.agent_setup.step_port')}</li>
                  {/if}
                  <li>{$t('auth.agent_setup.step_restart')}</li>
                </ol>
                <p class="hint">{$t('auth.agent_setup.later_hint')}</p>
              </div>
              <p class="help">
                <a href={AGENT_API_DOC_URL} target="_blank" rel="noopener noreferrer">
                  {$t('auth.agent_setup.docs')}
                </a>
              </p>
            {:else}
              <div class="agent-section">
                <div class="agent-header">
                  <span class="agent-title">{$t('auth.setup.agent_title')}</span>
                  <span class="agent-badge" class:active={agentApi.enabled}>
                    {$t(
                      agentApi.enabled ? 'auth.setup.agent_enabled' : 'auth.setup.agent_disabled',
                    )}
                  </span>
                </div>
                <p class="hint">{$t('auth.setup.agent_desc')}</p>

                <label class="checkbox-field">
                  <input type="checkbox" bind:checked={issueToken} disabled={submitting} />
                  <span>{$t('auth.setup.agent_issue_token')}</span>
                </label>

                <label class="checkbox-field">
                  <input type="checkbox" bind:checked={allowPacketSend} disabled={submitting} />
                  <span>{$t('auth.setup.agent_allow_packet_send')}</span>
                </label>

                {#if mode === 'setup' && agentApi.portEditable}
                  <label class="field">
                    <span>{$t('auth.setup.agent_port')}</span>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      bind:value={portInput}
                      disabled={submitting}
                    />
                  </label>
                {:else if !agentApi.portEditable}
                  <p class="hint">{$t('auth.setup.agent_port_locked')}</p>
                {:else}
                  <p class="hint">{$t('auth.agent_setup.port_in_settings')}</p>
                {/if}
              </div>
            {/if}
          {/if}

          {#if errorKey}
            <p class="error" role="alert">{$t(errorKey)}</p>
          {/if}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            isLoading={submitting}
            disabled={submitting}
          >
            {#if mode === 'agent-setup'}
              {$t(agentApi.enabled ? 'auth.agent_setup.submit' : 'auth.agent_setup.continue')}
            {:else if mode === 'setup'}
              {$t('auth.submit_setup')}
            {:else}
              {$t('auth.submit_login')}
            {/if}
          </Button>

          {#if mode === 'login'}
            <p class="help">
              <a href={PASSWORD_RESET_DOC_URL} target="_blank" rel="noopener noreferrer">
                {$t('auth.login.forgot_password')}
              </a>
            </p>
          {/if}
        </form>
      {/if}
    {/if}
  </div>
</div>

<style>
  .auth-gate {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    box-sizing: border-box;
  }

  .auth-card {
    width: min(420px, 100%);
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 14px;
    padding: 2rem;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
    box-sizing: border-box;
  }

  .brand {
    color: #38bdf8;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.75rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #f1f5f9;
  }

  .desc {
    margin: 0.5rem 0 1.5rem;
    color: #94a3b8;
    font-size: 0.92rem;
    line-height: 1.5;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.88rem;
    color: #cbd5e1;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.65rem 0.75rem;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(15, 23, 42, 0.6);
    color: #e2e8f0;
    font-size: 0.95rem;
    font-family: inherit;
  }

  input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
  }

  input:disabled {
    opacity: 0.6;
  }

  .hint {
    margin: -0.35rem 0 0;
    color: #64748b;
    font-size: 0.8rem;
  }

  .notice {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem;
    border: 1px solid rgba(251, 191, 36, 0.35);
    border-radius: 10px;
    background: rgba(251, 191, 36, 0.08);
  }

  .steps {
    margin: 0;
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    color: #cbd5e1;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .notice .hint {
    margin: 0;
  }

  .agent-section {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.45);
  }

  .agent-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .agent-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #e2e8f0;
  }

  .agent-badge {
    font-size: 0.72rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.2);
    color: #94a3b8;
  }

  .agent-badge.active {
    background: rgba(52, 211, 153, 0.18);
    color: #34d399;
  }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: #cbd5e1;
  }

  .checkbox-field input {
    width: auto;
  }

  .token {
    margin: 0;
    padding: 0.75rem;
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.3);
    color: #fbbf24;
    font-size: 0.8rem;
    word-break: break-all;
    white-space: pre-wrap;
  }

  .token-actions {
    display: flex;
    gap: 0.6rem;
    margin-top: 0.5rem;
  }

  .error {
    margin: 0;
    color: #f87171;
    font-size: 0.85rem;
  }

  .help {
    margin: 0.25rem 0 0;
    text-align: center;
    font-size: 0.85rem;
  }

  .help a {
    color: #60a5fa;
    text-decoration: none;
  }

  .help a:hover {
    text-decoration: underline;
  }
</style>
