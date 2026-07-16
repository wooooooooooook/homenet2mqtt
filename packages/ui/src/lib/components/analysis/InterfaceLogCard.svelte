<script lang="ts">
  import { t } from 'svelte-i18n';
  import type { InterfaceLogEntry } from '../../types';
  import { fade } from 'svelte/transition';
  import Button from '../Button.svelte';
  import { copyToClipboard } from '../../utils/clipboard';

  let {
    portId = null,
    integrationType = 'mqtt',
  }: { portId?: string | null; integrationType?: string } = $props();

  let logs = $state<InterfaceLogEntry[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Filters
  const activeIntegration = $derived(integrationType === 'matter' ? 'matter' : 'mqtt');
  let selectedDirection = $state<'all' | 'in' | 'out'>('all');
  let searchTerm = $state('');

  // Auto-refresh
  let autoRefresh = $state(true);
  let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  let isFetching = false;

  async function fetchLogs() {
    if (isFetching) return;
    isFetching = true;
    try {
      const url = portId
        ? `./api/logs/interface?portId=${encodeURIComponent(portId)}`
        : './api/logs/interface';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      logs = data.logs || [];
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      isFetching = false;
      loading = false;
    }
  }

  // Initial fetch and fetch when portId changes
  $effect(() => {
    const _portId = portId;
    loading = true;
    fetchLogs();
  });

  // Setup auto-refresh polling
  $effect(() => {
    if (autoRefresh) {
      autoRefreshTimer = setInterval(fetchLogs, 3000);
    } else {
      if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
      }
    }

    return () => {
      if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
      }
    };
  });

  // Filtered and processed logs
  const filteredLogs = $derived.by(() => {
    let result = [...logs];

    result = result.filter((log) => log.integration === activeIntegration);

    if (selectedDirection !== 'all') {
      result = result.filter((log) => log.direction === selectedDirection);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (log) =>
          log.topicOrEntityId.toLowerCase().includes(term) ||
          log.payload.toLowerCase().includes(term),
      );
    }

    // Sort by timestamp descending (newest first)
    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return result;
  });

  // Individual copying state
  let copiedItem = $state<string | null>(null);
  let copyTimeout: ReturnType<typeof setTimeout>;

  async function copyText(text: string, id: string) {
    const success = await copyToClipboard(text);
    if (success) {
      copiedItem = id;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copiedItem = null;
      }, 2000);
    }
  }

  // Copy all visible logs
  let copyAllSuccess = $state(false);
  async function copyAllLogs() {
    const lines = filteredLogs.map((log) => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const integration = log.integration.toUpperCase();
      const direction = log.direction.toUpperCase();
      return `[${time}] [${integration}] [${direction}] ${log.topicOrEntityId} -> ${log.payload}`;
    });

    const success = await copyToClipboard(lines.join('\n'));
    if (success) {
      copyAllSuccess = true;
      setTimeout(() => {
        copyAllSuccess = false;
      }, 2000);
    }
  }

  function formatTime(timestamp: string) {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString(undefined, { hour12: false });
    } catch {
      return timestamp;
    }
  }
</script>

<div class="interface-log-card">
  <div class="header">
    <div class="title-group">
      <h2>{$t('analysis.interface_log.title')}</h2>
      <p class="description">{$t('analysis.interface_log.desc')}</p>
    </div>
    <div class="header-actions">
      <label class="auto-refresh-label">
        <input type="checkbox" bind:checked={autoRefresh} />
        <span class="checkbox-text">{$t('analysis.interface_log.auto_refresh')}</span>
      </label>
      <Button variant="secondary" onclick={copyAllLogs} disabled={filteredLogs.length === 0}>
        {copyAllSuccess ? $t('common.copied') : $t('common.copy')}
      </Button>
      <Button variant="secondary" onclick={fetchLogs} disabled={loading}>
        {loading ? $t('common.loading') : $t('common.refresh')}
      </Button>
    </div>
  </div>

  <div class="controls">
    <input
      type="text"
      class="search-input"
      placeholder={$t('analysis.interface_log.search_placeholder')}
      bind:value={searchTerm}
    />

    <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">{$t('analysis.interface_log.direction_filter')}:</span>
        <div class="button-group">
          <button
            class="filter-btn"
            class:active={selectedDirection === 'all'}
            onclick={() => (selectedDirection = 'all')}
          >
            {$t('analysis.interface_log.all_directions')}
          </button>
          <button
            class="filter-btn"
            class:active={selectedDirection === 'in'}
            onclick={() => (selectedDirection = 'in')}
          >
            {$t('analysis.interface_log.direction_in')}
          </button>
          <button
            class="filter-btn"
            class:active={selectedDirection === 'out'}
            onclick={() => (selectedDirection = 'out')}
          >
            {$t('analysis.interface_log.direction_out')}
          </button>
        </div>
      </div>
    </div>
  </div>

  {#if error}
    <div class="error" transition:fade>
      <p>{error}</p>
      <Button variant="secondary" onclick={fetchLogs}>{$t('common.retry')}</Button>
    </div>
  {:else if loading && logs.length === 0}
    <div class="loading" transition:fade>
      <p>{$t('common.loading')}</p>
    </div>
  {:else}
    <div class="log-table-container">
      {#if filteredLogs.length === 0}
        <p class="empty">{$t('analysis.interface_log.empty')}</p>
      {:else}
        <table class="log-table">
          <thead>
            <tr>
              <th class="col-time">Time</th>
              <th class="col-service">Service</th>
              <th class="col-dir">Dir</th>
              <th class="col-topic">Topic / Entity</th>
              <th class="col-payload">Payload</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredLogs as log, i (log.timestamp + i)}
              <tr>
                <td class="col-time font-mono">{formatTime(log.timestamp)}</td>
                <td class="col-service">
                  <span class="badge badge-service {log.integration}">
                    {log.integration.toUpperCase()}
                  </span>
                </td>
                <td class="col-dir">
                  <span class="badge badge-dir {log.direction}">
                    {log.direction.toUpperCase()}
                  </span>
                </td>
                <td class="col-topic font-mono">
                  <div class="copyable-container">
                    <span class="text-truncate" title={log.topicOrEntityId}
                      >{log.topicOrEntityId}</span
                    >
                    <button
                      class="mini-copy-btn"
                      onclick={() => copyText(log.topicOrEntityId, `topic-${i}`)}
                      aria-label="Copy topic"
                    >
                      {#if copiedItem === `topic-${i}`}
                        <span class="mini-copy-success">✓</span>
                      {:else}
                        <svg
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      {/if}
                    </button>
                  </div>
                </td>
                <td class="col-payload font-mono">
                  <div class="copyable-container">
                    <span class="text-truncate" title={log.payload}>{log.payload}</span>
                    <button
                      class="mini-copy-btn"
                      onclick={() => copyText(log.payload, `payload-${i}`)}
                      aria-label="Copy payload"
                    >
                      {#if copiedItem === `payload-${i}`}
                        <span class="mini-copy-success">✓</span>
                      {:else}
                        <svg
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      {/if}
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</div>

<style>
  .interface-log-card {
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 12px;
    padding: 1.5rem;
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  @media (max-width: 480px) {
    .interface-log-card {
      padding: 0.75rem;
      border-radius: 8px;
    }
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    padding-bottom: 0.75rem;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .title-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .header h2 {
    margin: 0;
    font-size: 1.1rem;
    color: #f1f5f9;
  }

  .description {
    color: #94a3b8;
    font-size: 0.85rem;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .auto-refresh-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    font-size: 0.85rem;
    color: #94a3b8;
    user-select: none;
    padding: 0.4rem 0.6rem;
    background: rgba(15, 23, 42, 0.2);
    border-radius: 6px;
    border: 1px solid rgba(148, 163, 184, 0.08);
  }

  .auto-refresh-label input[type='checkbox'] {
    accent-color: #38bdf8;
    cursor: pointer;
    margin: 0;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .search-input {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #e2e8f0;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    width: 100%;
    font-size: 0.9rem;
    box-sizing: border-box;
  }

  .search-input:focus {
    outline: none;
    border-color: rgba(56, 189, 248, 0.5);
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
  }

  .filter-bar {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-label {
    font-size: 0.85rem;
    color: #94a3b8;
    font-weight: 500;
  }

  .button-group {
    display: flex;
    background: rgba(15, 23, 42, 0.3);
    padding: 0.2rem;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.08);
  }

  .filter-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .filter-btn:hover {
    color: #e2e8f0;
  }

  .filter-btn.active {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.15);
  }

  .log-table-container {
    max-height: 500px;
    overflow-y: auto;
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.2);
  }

  .log-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    text-align: left;
  }

  .log-table th {
    background: rgba(15, 23, 42, 0.4);
    padding: 0.6rem 0.75rem;
    color: #94a3b8;
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 1;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  }

  .log-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.05);
    vertical-align: middle;
    color: #cbd5e1;
  }

  .log-table tr:hover {
    background: rgba(148, 163, 184, 0.03);
  }

  .font-mono {
    font-family: var(--font-mono, monospace);
  }

  .col-time {
    width: 90px;
    white-space: nowrap;
  }

  .col-service {
    width: 80px;
  }

  .col-dir {
    width: 60px;
  }

  .col-topic {
    width: 30%;
    min-width: 150px;
    max-width: 300px;
  }

  .col-payload {
    min-width: 200px;
  }

  .badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.15rem 0.35rem;
    border-radius: 4px;
    letter-spacing: 0.02em;
    display: inline-block;
    text-align: center;
  }

  .badge-service.mqtt {
    background: rgba(14, 165, 233, 0.1);
    color: #38bdf8;
    border: 1px solid rgba(14, 165, 233, 0.25);
  }

  .badge-service.matter {
    background: rgba(168, 85, 247, 0.1);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.25);
  }

  .badge-dir.in {
    background: rgba(16, 185, 129, 0.1);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .badge-dir.out {
    background: rgba(245, 158, 11, 0.1);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .copyable-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
  }

  .text-truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .mini-copy-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 0.2rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .mini-copy-btn:hover {
    color: #f1f5f9;
    background: rgba(148, 163, 184, 0.1);
  }

  .mini-copy-success {
    color: #34d399;
    font-size: 0.75rem;
    font-weight: bold;
  }

  .empty,
  .loading,
  .error {
    padding: 2.5rem;
    text-align: center;
    color: #94a3b8;
  }

  .error {
    color: #ef4444;
  }
</style>
