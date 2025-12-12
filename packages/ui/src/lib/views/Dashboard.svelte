<script lang="ts">
  import type { BridgeInfo, UnifiedEntity, BridgeSerialInfo } from '../types';
  import EntityCard from '../components/EntityCard.svelte';
  import { createEventDispatcher } from 'svelte';

  let {
    bridgeInfo,
    infoLoading,
    infoError,
    portMetadata,
    mqttUrl,
    entities,
    selectedPortId,
    showInactive,
  } = $props<{
    bridgeInfo: BridgeInfo | null;
    infoLoading: boolean;
    infoError: string;
    portMetadata: Array<BridgeSerialInfo & { configFile: string }>;
    mqttUrl: string;
    entities: UnifiedEntity[];
    selectedPortId: string | null;
    showInactive: boolean;
  }>();

  const dispatch = createEventDispatcher<{
    select: { entityId: string };
    toggleInactive: void;
    portChange: { portId: string };
  }>();

  const portIds = $derived.by<string[]>(() => portMetadata.map((port: BridgeSerialInfo & { configFile: string }) => port.portId));
  const activePortId = $derived.by<string | null>(() =>
    selectedPortId && portIds.includes(selectedPortId) ? selectedPortId : portIds[0] ?? null,
  );
  const visibleEntities = $derived.by<UnifiedEntity[]>(() =>
    activePortId ? entities.filter((entity: UnifiedEntity) => !entity.portId || entity.portId === activePortId) : entities,
  );

  function handleSelect(entityId: string) {
    dispatch('select', { entityId });
  }
</script>

<div class="dashboard-view">
  {#if infoLoading && !bridgeInfo && !infoError}
    <div class="loading-state">
      <p class="hint">브리지 정보를 불러오는 중입니다...</p>
    </div>
  {:else if infoError}
    <div class="error-state">
      <p class="error">{infoError}</p>
    </div>
  {:else if !bridgeInfo}
    <div class="empty-state">
      <p class="empty">브리지 정보가 없습니다.</p>
    </div>
  {:else}
    <!-- Metadata Section -->
    <div class="viewer-meta">
      <div class="meta-card mqtt">
        <span class="label">MQTT URL</span>
        <strong>{mqttUrl}</strong>
      </div>
      {#each portMetadata as port (port.portId)}
        <div class="meta-card">
          <div class="meta-header">
            <span class="badge">{port.portId}</span>
            <small class="config-file">{port.configFile}</small>
          </div>
          <div class="meta-row">
            <span class="label">Serial Path</span>
            <strong>{port.path || '입력되지 않음'}</strong>
          </div>
          <div class="meta-row">
            <span class="label">Baud Rate</span>
            <strong>{port.baudRate}</strong>
          </div>
        </div>
      {/each}
    </div>

    {#if bridgeInfo.error}
      <div class="bridge-error">
        <p class="error subtle">브리지 오류: {bridgeInfo.error}</p>
      </div>
    {/if}

    <!-- Toolbar Section -->
    <div class="dashboard-toolbar">
      <div class="port-tabs" aria-label="포트 선택">
        {#if portIds.length === 0}
          <span class="hint">구성된 포트가 없습니다.</span>
        {:else}
          {#each portIds as portId}
            <button
              class:active={activePortId === portId}
              type="button"
              on:click={() => dispatch('portChange', { portId })}
            >
              {portId}
            </button>
          {/each}
        {/if}
      </div>
      <label class="toggle-switch">
        <input type="checkbox" checked={showInactive} on:change={() => dispatch('toggleInactive')} />
        <span class="slider"></span>
        비활성 엔티티 보기
      </label>
    </div>

    <!-- Entity Grid Section -->
    <div class="entity-grid">
      {#if visibleEntities.length === 0 && !infoLoading}
        <div class="empty-grid">
          <p class="empty full-width">선택한 포트에서 감지된 장치나 설정된 명령이 없습니다.</p>
        </div>
      {:else}
        {#each visibleEntities as entity (entity.id)}
          <EntityCard {entity} on:select={() => handleSelect(entity.id)} />
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .dashboard-view {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .viewer-meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
    padding: 1.5rem;
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(148, 163, 184, 0.1);
  }

  .meta-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.2);
  }

  .meta-card.mqtt {
    grid-column: 1 / -1;
    background: rgba(37, 99, 235, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .meta-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: space-between;
  }

  .meta-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.15);
    color: #bfdbfe;
    font-weight: 700;
    font-size: 0.85rem;
  }

  .config-file {
    color: #94a3b8;
    font-size: 0.8rem;
  }

  .label {
    font-size: 0.85rem;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  strong {
    color: #f1f5f9;
    font-size: 1rem;
    font-family: monospace;
    word-break: break-all;
  }

  .bridge-error {
    margin-top: 1rem;
  }

  .error {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .entity-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  .hint,
  .empty {
    color: #94a3b8;
    font-style: italic;
    text-align: center;
    padding: 2rem;
  }
  .dashboard-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 1rem 0;
    flex-wrap: wrap;
  }

  .port-tabs {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .port-tabs button {
    padding: 0.5rem 0.9rem;
    border-radius: 10px;
    background: rgba(148, 163, 184, 0.1);
    color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.3);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .port-tabs button.active {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.6);
    color: #bfdbfe;
    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.25);
  }

  .port-tabs button:hover {
    border-color: rgba(148, 163, 184, 0.6);
  }

  .toggle-switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    font-size: 0.9rem;
    color: #cbd5e1;
    gap: 0.5rem;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    width: 36px;
    height: 20px;
    background-color: #334155;
    border-radius: 10px;
    transition: background-color 0.2s;
    margin-right: 0.25rem;
    position: relative;
  }

  .slider:before {
    content: '';
    position: absolute;
    height: 14px;
    width: 14px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }

  input:checked + .slider {
    background-color: #3b82f6;
  }

  input:checked + .slider:before {
    transform: translateX(16px);
  }
</style>
