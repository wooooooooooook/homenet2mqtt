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
  import InterfaceLogCard from '../components/analysis/InterfaceLogCard.svelte';

  type AnalyzerStateOption = {
    id: string;
    label: string;
    state: Record<string, unknown>;
    portId?: string;
  };

  type VisibilityState = {
    'packet-log': boolean;
    'packet-sender': boolean;
    'packet-dictionary': boolean;
    'packet-analyzer': boolean;
    'cel-analyzer': boolean;
    'interface-log': boolean;
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
    portMetadata: Array<BridgeSerialInfo & { configFile: string; integrationType?: string }>;
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
    // svelte-ignore state_referenced_locally
    'packet-dictionary': Boolean(logRetentionEnabled),
    'packet-analyzer': true,
    'cel-analyzer': true,
    'interface-log': true,
  });

  const activeIntegrationType = $derived.by<string>(() => {
    const port = portMetadata.find((p) => p.portId === activePortId);
    return port?.integrationType || 'mqtt';
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
    ...(logRetentionEnabled
      ? [{ id: 'packet-dictionary', label: $t('analysis.packet_dictionary.title') }]
      : []),
    { id: 'packet-analyzer', label: $t('analysis.packet_analyzer.title') },
    { id: 'cel-analyzer', label: $t('analysis.cel_analyzer.title') },
    { id: 'interface-log', label: $t('analysis.interface_log.title') },
  ]);

  let activeSection = $state<string>('packet-log');
  let activeLogTab = $state<'parsed' | 'raw'>('parsed');

  $effect(() => {
    // Watch visibility to trigger re-observe when DOM elements are toggled
    const _trigger = Object.values(visibility);
    const rootEl = document.querySelector('.main-content');
    if (!rootEl) return;

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      const intersecting = entries.filter((e) => e.isIntersecting);
      if (intersecting.length > 0) {
        // Sort visible items by their distance from the top of viewport to activate the topmost one
        intersecting.sort(
          (a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top),
        );
        activeSection = intersecting[0].target.id;
      }
    };

    const observer = new IntersectionObserver(handleIntersect, {
      root: rootEl,
      rootMargin: '-80px 0px -60% 0px', // Target active viewport zone below mobile sticky bar
      threshold: 0,
    });

    const timer = setTimeout(() => {
      menuItems.forEach((item) => {
        const el = document.getElementById(item.id);
        if (el) observer.observe(el);
      });
    }, 150);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  });

  const handleAnchorClick = (event: MouseEvent, targetId: string) => {
    event.preventDefault();

    const scrollTargetId = targetId;

    const element = document.getElementById(scrollTargetId);
    const container = document.querySelector('.main-content');
    const sidebar = document.querySelector('.analysis-sidebar');

    if (element && container) {
      const containerScrollTop = container.scrollTop;
      const elementTop = element.getBoundingClientRect().top;
      const containerTop = container.getBoundingClientRect().top;

      const targetScrollTop = containerScrollTop + elementTop - containerTop;
      const isMobile = window.innerWidth <= 768;
      const offset = isMobile && sidebar ? (sidebar as HTMLElement).offsetHeight : 0;
      const margin = 16;

      container.scrollTo({
        top: targetScrollTop - offset - margin,
        behavior: 'smooth',
      });

      history.pushState(null, '', `#${targetId}`);
      activeSection = targetId;
    }
  };

  let isSidebarCollapsed = $state(false);
</script>

<div class="analysis-view">
  <div class="view-header">
    <div class="header-main">
      <h1>{$t('sidebar.analysis')}</h1>
    </div>
  </div>

  <div class="analysis-layout" class:sidebar-collapsed={isSidebarCollapsed}>
    <aside
      class="analysis-sidebar"
      class:collapsed={isSidebarCollapsed}
      aria-label={$t('sidebar.analysis')}
    >
      <button
        type="button"
        class="sidebar-toggle-btn"
        onclick={() => (isSidebarCollapsed = !isSidebarCollapsed)}
        aria-label={isSidebarCollapsed ? 'Open analysis sidebar' : 'Close analysis sidebar'}
        title={isSidebarCollapsed ? 'Open analysis sidebar' : 'Close analysis sidebar'}
      >
        {#if isSidebarCollapsed}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg
          >
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg
          >
        {/if}
      </button>
      <nav>
        {#each menuItems as item (item.id)}
          <div
            class="sidebar-item"
            class:hidden={!visibility[item.id as keyof VisibilityState]}
            class:active={activeSection === item.id}
          >
            {#if visibility[item.id as keyof VisibilityState]}
              <a href="#{item.id}" onclick={(e) => handleAnchorClick(e, item.id)}>{item.label}</a>
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
        <div id="packet-log" class="log-section combined-log-card">
          <div class="card-header">
            <h2>{$t('analysis.packet_log.title')}</h2>
            <div class="tabs-bar">
              <button
                type="button"
                class="tab-btn"
                class:active={activeLogTab === 'parsed'}
                onclick={() => {
                  activeLogTab = 'parsed';
                }}
              >
                Rx/Tx
              </button>
              <button
                type="button"
                class="tab-btn"
                class:active={activeLogTab === 'raw'}
                onclick={() => {
                  activeLogTab = 'raw';
                }}
              >
                Raw
              </button>
            </div>
          </div>

          <!-- 설명 영역 -->
          <div class="tab-desc-container">
            {#if activeLogTab === 'parsed'}
              <p class="description">{$t('analysis.packet_log.desc')}</p>
            {:else if activeLogTab === 'raw'}
              <p class="description">{$t('analysis.raw_log.desc')}</p>
            {/if}
          </div>

          <!-- 탭 콘텐츠 영역 -->
          <div class="tab-content">
            {#if activeLogTab === 'parsed'}
              <div class="parsed-log-wrapper">
                <PacketLog {commandLogs} {parsedLogs} {packetDictionary} />
              </div>
            {:else if activeLogTab === 'raw'}
              <div id="raw-packet-log">
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
                  showSender={false}
                  showLog={true}
                />
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Packet Sender는 별개로 렌더링 -->
      {#if visibility['packet-sender']}
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
          showSender={true}
          showLog={false}
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

      {#if visibility['interface-log']}
        <div id="interface-log" class="analysis-section">
          <InterfaceLogCard portId={activePortId} integrationType={activeIntegrationType} />
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
    transition: grid-template-columns 0.3s ease;
  }

  .analysis-layout.sidebar-collapsed {
    grid-template-columns: 16px minmax(0, 1fr);
  }

  .sidebar-toggle-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: -8px;
    width: 14px;
    height: 64px;
    border-radius: 4px;
    background: #1e293b;
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    transition: all 0.2s ease;
    padding: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .sidebar-toggle-btn:hover {
    background: #334155;
    color: #f8fafc;
    border-color: rgba(148, 163, 184, 0.4);
  }

  .sidebar-toggle-btn svg {
    width: 10px;
    height: 10px;
  }

  .analysis-sidebar {
    position: sticky;
    top: 1rem;
    height: calc(100vh - 230px);
    background: rgba(15, 23, 42, 0.4);
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 12px;
    padding: 0.75rem;
    transition: all 0.3s ease;
    box-sizing: border-box;
  }

  .analysis-sidebar.collapsed {
    padding: 0;
    width: 16px;
    min-width: 16px;
    box-sizing: border-box;
    background: transparent;
    border: 1px solid transparent;
    border-right: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 0;
  }

  .analysis-sidebar.collapsed nav {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0.1s ease,
      visibility 0.1s ease;
  }

  .analysis-sidebar nav {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    white-space: nowrap;
    opacity: 1;
    visibility: visible;
    transition:
      opacity 0.2s ease 0.15s,
      visibility 0.2s ease 0.15s;
    overflow: hidden;
    width: 100%;
  }

  .sidebar-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 8px;
    padding: 0.1rem 0.2rem;
    transition: all 0.15s ease;
    border-left: 3px solid transparent;
  }

  .sidebar-item:hover {
    background: rgba(148, 163, 184, 0.08);
  }

  .sidebar-item.active {
    background: rgba(56, 189, 248, 0.12);
    border-left-color: #38bdf8;
    border-radius: 0 8px 8px 0;
  }

  .sidebar-item.active a {
    color: #38bdf8;
    font-weight: 500;
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

  @media (min-width: 769px) and (max-width: 1060px) {
    .analysis-layout {
      grid-template-columns: 180px minmax(0, 1fr);
    }
    .analysis-layout.sidebar-collapsed {
      grid-template-columns: 16px minmax(0, 1fr);
    }
  }

  @media (max-width: 768px) {
    .sidebar-toggle-btn {
      display: none;
    }

    .analysis-layout {
      grid-template-columns: 1fr;
    }

    .analysis-sidebar {
      position: sticky;
      top: -0.75rem;
      height: auto;
      z-index: 10;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(8px);
      margin: -0.75rem -0.75rem 1rem -0.75rem;
      padding: 0.75rem;
      border-radius: 0;
      border-left: none;
      border-right: none;
      border-top: none;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
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
      border-radius: 8px;
    }

    .sidebar-item a,
    .sidebar-item .disabled-label {
      font-size: 0.8rem;
      padding: 0.3rem 0.4rem;
    }

    .sidebar-item.active {
      background: rgba(56, 189, 248, 0.15);
      border-color: rgba(56, 189, 248, 0.4);
      border-left-color: transparent;
      border-radius: 8px;
    }

    .visibility-toggle .icon {
      width: 0.95rem;
      height: 0.95rem;
    }

    .view-header {
      margin-bottom: 0;
    }

    .analysis-section {
      scroll-margin-top: 10rem;
    }

    :global(#packet-sender),
    :global(#raw-packet-log) {
      scroll-margin-top: 10rem;
    }
  }

  .combined-log-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 12px;
    padding: 1.5rem;
  }

  @media (max-width: 480px) {
    .combined-log-card {
      padding: 0.75rem;
      border-radius: 8px;
    }
  }

  .card-header {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    padding-bottom: 0.5rem;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .card-header h2 {
    font-size: 1.1rem;
    margin: 0;
    color: #e2e8f0;
  }

  .tabs-bar {
    display: flex;
    gap: 0.25rem;
    background: rgba(15, 23, 42, 0.3);
    padding: 0.25rem;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.08);
  }

  .tab-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 0.35rem 0.75rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .tab-btn:hover {
    color: #e2e8f0;
  }

  .tab-btn.active {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.15);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .tab-desc-container {
    margin-top: -0.25rem;
  }

  .description {
    color: #94a3b8;
    font-size: 0.875rem;
    margin: 0;
    line-height: 1.4;
  }
</style>
