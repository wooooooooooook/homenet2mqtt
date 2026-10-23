<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import Button from './Button.svelte';
  import Toggle from './Toggle.svelte';
  import {
    AgentApiError,
    getAgentApiStatus,
    issueAgentApiToken,
    updateAgentApiSettings,
    type AgentApiStatus,
  } from '../api/agent-api';
  import { copyToClipboard } from '../utils/clipboard';

  let status = $state<AgentApiStatus | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let errorKey = $state<string | null>(null);
  let noticeKey = $state<string | null>(null);
  let issuedToken = $state<string | null>(null);
  let copied = $state(false);
  let portInput = $state('3001');

  const parsedPort = $derived(Number(portInput));
  const portChanged = $derived(
    status !== null &&
      Number.isInteger(parsedPort) &&
      parsedPort >= 1 &&
      parsedPort <= 65535 &&
      parsedPort !== status.port,
  );

  function resolveErrorKey(err: unknown): string {
    if (err instanceof AgentApiError) {
      switch (err.code) {
        case 'AGENT_API_UNAVAILABLE':
          return 'settings.agent_api.errors.unavailable';
        case 'INVALID_PORT':
          return 'settings.agent_api.errors.invalid_port';
        case 'PORT_CONFLICT':
          return 'settings.agent_api.errors.port_conflict';
        case 'PORT_MANAGED_BY_ADDON':
          return 'settings.agent_api.errors.port_managed_by_addon';
        case 'RATE_LIMITED':
          return 'settings.agent_api.errors.rate_limited';
        case 'NETWORK_ERROR':
          return 'settings.agent_api.errors.network';
        default:
          return 'settings.agent_api.errors.unknown';
      }
    }
    return 'settings.agent_api.errors.unknown';
  }

  async function refresh() {
    try {
      status = await getAgentApiStatus();
      portInput = String(status.port);
    } catch (err) {
      errorKey = resolveErrorKey(err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void refresh();
  });

  async function handleIssueToken() {
    saving = true;
    errorKey = null;
    noticeKey = null;
    copied = false;
    try {
      const result = await issueAgentApiToken();
      issuedToken = result.token;
      await refresh();
    } catch (err) {
      errorKey = resolveErrorKey(err);
    } finally {
      saving = false;
    }
  }

  async function handleCopyToken() {
    if (!issuedToken) return;
    copied = await copyToClipboard(issuedToken);
  }

  async function saveSettings(payload: { port?: number; allowPacketSend?: boolean }) {
    saving = true;
    errorKey = null;
    noticeKey = null;
    try {
      const result = await updateAgentApiSettings(payload);
      noticeKey = result.restartRequired
        ? 'settings.agent_api.restart_required'
        : 'settings.agent_api.saved';
      await refresh();
    } catch (err) {
      errorKey = resolveErrorKey(err);
    } finally {
      saving = false;
    }
  }

  function handlePacketSendChange(checked: boolean) {
    void saveSettings({ allowPacketSend: checked });
  }

  function handlePortSave() {
    if (!portChanged) return;
    void saveSettings({ port: parsedPort });
  }
</script>

<div class="agent-api">
  {#if loading}
    <div class="loading">{$t('settings.loading')}</div>
  {:else if status}
    <div class="row">
      <div class="row-text">
        <div class="title">{$t('settings.agent_api.state_title')}</div>
        <div class="desc">
          {#if !status.enabled}
            {$t('settings.agent_api.state_env_disabled')}
          {:else if status.unavailable}
            {$t('settings.agent_api.state_unavailable')}
          {:else if !status.hasToken}
            {$t('settings.agent_api.state_no_token')}
          {:else if status.ready}
            {$t('settings.agent_api.state_ready')}
          {:else}
            {$t('settings.agent_api.state_not_ready')}
          {/if}
        </div>
      </div>
      <span class="badge" class:active={status.ready}>
        {$t(status.ready ? 'settings.agent_api.badge_active' : 'settings.agent_api.badge_inactive')}
      </span>
    </div>

    {#if status.actualPort !== null && status.actualPort !== status.port}
      <p class="warning">
        {$t('settings.agent_api.port_fallback_notice', { values: { port: status.actualPort } })}
      </p>
    {/if}

    <div class="row">
      <div class="row-text">
        <div class="title">{$t('settings.agent_api.token_title')}</div>
        <div class="desc">
          {$t(
            status.hasToken
              ? 'settings.agent_api.token_reissue_desc'
              : 'settings.agent_api.token_create_desc',
          )}
        </div>
      </div>
      <Button variant="secondary" onclick={handleIssueToken} isLoading={saving} disabled={saving}>
        {$t(
          status.hasToken
            ? 'settings.agent_api.token_regenerate'
            : 'settings.agent_api.token_generate',
        )}
      </Button>
    </div>

    {#if issuedToken}
      <div class="token-box">
        <pre class="token">{issuedToken}</pre>
        <Button variant="secondary" onclick={handleCopyToken}>
          {$t(copied ? 'settings.agent_api.token_copied' : 'settings.agent_api.token_copy')}
        </Button>
      </div>
      <p class="warning">{$t('settings.agent_api.token_once_hint')}</p>
    {/if}

    <div class="row">
      <div class="row-text">
        <div class="title" id="agent-api-packet-send-title">
          {$t('settings.agent_api.packet_send_title')}
        </div>
        <div class="desc" id="agent-api-packet-send-desc">
          {$t('settings.agent_api.packet_send_desc')}
        </div>
      </div>
      <Toggle
        checked={status.allowPacketSend}
        onchange={handlePacketSendChange}
        disabled={saving}
        ariaLabelledBy="agent-api-packet-send-title"
        ariaDescribedBy="agent-api-packet-send-desc"
      />
    </div>

    {#if status.portEditable}
      <div class="row">
        <div class="row-text">
          <div class="title">{$t('settings.agent_api.port_title')}</div>
          <div class="desc">{$t('settings.agent_api.port_desc')}</div>
        </div>
        <div class="port-controls">
          <input
            type="number"
            class="number-input"
            min="1"
            max="65535"
            bind:value={portInput}
            disabled={saving}
          />
          <Button variant="primary" onclick={handlePortSave} disabled={saving || !portChanged}>
            {$t('settings.agent_api.port_save')}
          </Button>
        </div>
      </div>
    {:else}
      <p class="hint">{$t('settings.agent_api.port_locked')}</p>
    {/if}

    {#if errorKey}
      <p class="error" role="alert">{$t(errorKey)}</p>
    {/if}
    {#if noticeKey}
      <p class="success" role="status">{$t(noticeKey)}</p>
    {/if}
  {:else}
    <p class="error" role="alert">{$t('settings.agent_api.errors.load_failed')}</p>
  {/if}
</div>

<style>
  .agent-api {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0;
    border-top: 1px solid rgba(148, 163, 184, 0.15);
  }

  .row-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .title {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .desc {
    font-size: 0.8rem;
    opacity: 0.8;
  }

  .badge {
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.2);
  }

  .badge.active {
    background: rgba(52, 211, 153, 0.18);
    color: #34d399;
  }

  .number-input {
    width: 110px;
    padding: 0.5rem 0.6rem;
    border-radius: 8px;
    font-size: 0.9rem;
  }

  .port-controls {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .token-box {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .token {
    flex: 1;
    margin: 0;
    padding: 0.6rem;
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.55);
    color: #fbbf24;
    font-size: 0.78rem;
    word-break: break-all;
    white-space: pre-wrap;
  }

  .hint {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.75;
  }

  .warning {
    margin: 0;
    font-size: 0.82rem;
    color: #fbbf24;
  }

  .error {
    margin: 0;
    font-size: 0.85rem;
    color: #f87171;
  }

  .success {
    margin: 0;
    font-size: 0.85rem;
    color: #34d399;
  }

  .loading {
    font-size: 0.85rem;
    opacity: 0.7;
  }

  @media (max-width: 720px) {
    .row {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
