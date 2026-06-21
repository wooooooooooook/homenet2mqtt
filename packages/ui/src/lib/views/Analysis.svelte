<script lang="ts">
  import { t } from 'svelte-i18n';
  import type {
    CommandPacket,
    PacketStats as PacketStatsType,
    RawPacketWithInterval,
    ParsedPacket,
    BridgeSerialInfo,
    PacketLogEntry,
    CommandLogEntry,
  } from '../types';
  import PacketLog from '../components/PacketLog.svelte';
  import RawPacketLog from '../components/RawPacketLog.svelte';
  import PacketDictionaryView from '../components/PacketDictionaryView.svelte';
  import CelAnalyzerCard from '../components/analysis/CelAnalyzerCard.svelte';
  import PacketAnalyzerCard from '../components/analysis/PacketAnalyzerCard.svelte';

  type AnalyzerStateOption = {
    id: string;
    label: string;
    state: Record<string, unknown>;
    portId?: string;
  };

  type VisibilityState = {
    'packet-log': boolean;
    'packet-sender': boolean;
    'raw-packet-log': boolean;
    'packet-dictionary': boolean;
    'packet-analyzer': boolean;
    'cel-analyzer': boolean;
  };

  let {
    stats,
    parsedPackets, // Legacy prop, kept for compatibility if needed elsewhere
    commandPackets, // Legacy prop, kept for compatibility if needed elsewhere
    rawPackets,
    packetDictionary,
    isStreaming,
    portMetadata,
    activePortId,
    onStart,
    onStop,
    validOnly = $bindable(false),
    isRecording = $bindable(),
    recordingStartTime = $bindable(),
    recordedFile = $bindable(),
    logRetentionEnabled,
    parsedLogs = [],
    commandLogs = [],
    statesSnapshot,
    stateOptions,
  }: {
    stats: PacketStatsType | null;
    parsedPackets: ParsedPacket[];
    commandPackets: CommandPacket[];
    rawPackets: RawPacketWithInterval[];
    packetDictionary: Record<string, string>;
    isStreaming: boolean;
    portMetadata: Array<BridgeSerialInfo & { configFile: string }>;
    activePortId: string | null;
    onStart?: () => void;
    onStop?: () => void;
    validOnly: boolean;
    isRecording: boolean;
    recordingStartTime: number | null;
    recordedFile: { filename: string; path: string } | null;
    logRetentionEnabled: boolean;
    parsedLogs: PacketLogEntry[];
    commandLogs: CommandLogEntry[];
    statesSnapshot: Record<string, Record<string, unknown>>;
    stateOptions: AnalyzerStateOption[];
  } = $props();

  const portIds = $derived.by<string[]>(() =>
    portMetadata.map((port: BridgeSerialInfo & { configFile: string }) => port.portId),
  );

  let visibility = $state<VisibilityState>({
    'packet-log': true,
    'packet-sender': true,
    'raw-packet-log': true,
    // svelte-ignore state_referenced_locally
    'packet-dictionary': Boolean(logRetentionEnabled),
    'packet-analyzer': true,
    'cel-analyzer': true,
  });

  // Keep packet-dictionary in sync when logRetentionEnabled changes
  $effect(() => {
    if (!logRetentionEnabled) {
      visibility['packet-dictionary'] = false;
    } else {
      visibility['packet-dictionary'] = true;
    }
  });

  const menuItems = $derived([
    { id: 'packet-log', label: $t('analysis.packet_log.title') },
    { id: 'packet-sender', label: $t('analysis.raw_log.sender.title') },
    { id: 'raw-packet-log', label: $t('analysis.raw_log.title') },
    ...(logRetentionEnabled
      ? [{ id: 'packet-dictionary', label: $t('analysis.packet_dictionary.title') }]
      : []),
    { id: 'packet-analyzer', label: $t('analysis.packet_analyzer.title') },
    { id: 'cel-analyzer', label: $t('analysis.cel_analyzer.title') },
  ]);
</script>

<div class="analysis-view">
  <div class="view-header">
    <div class="header-main">
      <h1>{$t('sidebar.analysis')}</h1>
    </div>
  </div>

  <div class="analysis-layout">
    <aside class="analysis-sidebar" aria-label={$t('sidebar.analysis')}>
      <nav>
        {#each menuItems as item (item.id)}
          <div class="sidebar-item" class:hidden={!visibility[item.id as keyof VisibilityState]}>
            {#if visibility[item.id as keyof VisibilityState]}
              <a href="#{item.id}">{item.label}</a>
            {:else}
              <span class="disabled-label">{item.label}</span>
            {/if}
            <button
              class="visibility-toggle"
              onclick={() => {
                const key = item.id as keyof VisibilityState;
                visibility[key] = !visibility[key];
              }}
              aria-label={visibility[item.id as keyof VisibilityState]
                ? 'Hide section'
                : 'Show section'}
              title={visibility[item.id as keyof VisibilityState] ? 'Hide section' : 'Show section'}
            >
              {#if visibility[item.id as keyof VisibilityState]}
                <!-- Eye Icon SVG (Visible) -->
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.8"
                  stroke="currentColor"
                  class="icon"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                </svg>
              {:else}
                <!-- Eye Slash Icon SVG (Hidden) -->
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.8"
                  stroke="currentColor"
                  class="icon"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.893 7.893 3 3m-3-3a9.08 9.08 0 0 0-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                  />
                </svg>
              {/if}
            </button>
          </div>
        {/each}
      </nav>
    </aside>

    <div class="analysis-content">
      {#if visibility['packet-log']}
        <div id="packet-log" class="analysis-section">
          <PacketLog {commandLogs} {parsedLogs} {packetDictionary} />
        </div>
      {/if}

      {#if visibility['packet-sender'] || visibility['raw-packet-log']}
        <RawPacketLog
          {rawPackets}
          {packetDictionary}
          {isStreaming}
          {stats}
          {onStart}
          {onStop}
          bind:validOnly
          bind:isRecording
          bind:recordingStartTime
          bind:recordedFile
          portId={activePortId}
          showSender={visibility['packet-sender']}
          showLog={visibility['raw-packet-log']}
        />
      {/if}

      {#if logRetentionEnabled && visibility['packet-dictionary']}
        <div id="packet-dictionary" class="analysis-section">
          <PacketDictionaryView portId={activePortId} />
        </div>
      {/if}

      {#if visibility['packet-analyzer']}
        <div id="packet-analyzer" class="analysis-section">
          <PacketAnalyzerCard {portIds} {activePortId} />
        </div>
      {/if}

      {#if visibility['cel-analyzer']}
        <div id="cel-analyzer" class="analysis-section">
          <CelAnalyzerCard {statesSnapshot} {stateOptions} />
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .analysis-view {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .header-main {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #f8fafc;
    margin: 0;
  }

  .analysis-layout {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }

  .analysis-sidebar {
    position: sticky;
    top: 1rem;
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 12px;
    padding: 0.75rem;
  }

  .analysis-sidebar nav {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .sidebar-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 8px;
    padding: 0.1rem 0.2rem;
    transition: background-color 0.15s ease;
  }

  .sidebar-item:hover {
    background: rgba(148, 163, 184, 0.08);
  }

  .sidebar-item a,
  .sidebar-item .disabled-label {
    flex: 1;
    color: #cbd5e1;
    text-decoration: none;
    font-size: 0.9rem;
    padding: 0.45rem 0.6rem;
    border-radius: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-item a:hover {
    background: rgba(148, 163, 184, 0.1);
  }

  .sidebar-item.hidden a,
  .sidebar-item.hidden .disabled-label {
    color: #64748b;
    text-decoration: line-through;
    opacity: 0.6;
  }

  .sidebar-item .disabled-label {
    cursor: default;
  }

  .visibility-toggle {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 0.4rem;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .visibility-toggle:hover {
    color: #f8fafc;
    background: rgba(148, 163, 184, 0.15);
  }

  .visibility-toggle .icon {
    width: 1.1rem;
    height: 1.1rem;
  }

  .analysis-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .analysis-section {
    scroll-margin-top: 1rem;
  }

  :global(#packet-sender),
  :global(#raw-packet-log) {
    scroll-margin-top: 1rem;
  }

  @media (max-width: 768px) {
    .analysis-layout {
      grid-template-columns: 1fr;
    }

    .analysis-sidebar {
      position: static;
      padding: 0.5rem;
    }

    .analysis-sidebar nav {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .sidebar-item {
      padding: 0.1rem 0.3rem;
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(148, 163, 184, 0.1);
    }

    .sidebar-item a,
    .sidebar-item .disabled-label {
      font-size: 0.8rem;
      padding: 0.3rem 0.4rem;
    }

    .visibility-toggle .icon {
      width: 0.95rem;
      height: 0.95rem;
    }

    .view-header {
      margin-bottom: 0;
    }
  }
</style>
