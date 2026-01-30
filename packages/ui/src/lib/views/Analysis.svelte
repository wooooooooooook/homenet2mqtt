<script lang="ts">
  import { tick } from 'svelte';
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
  import AnalysisChipBar from '../components/analysis/AnalysisChipBar.svelte';

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
    'packet-dictionary': Boolean(logRetentionEnabled), // Initial state depends on retention
    'packet-analyzer': true,
    'cel-analyzer': true,
  });

  // Keep packet-dictionary sync with logRetentionEnabled if needed,
  // but let's assume user toggle overrides it or it resets when prop changes.
  $effect(() => {
    if (!logRetentionEnabled) {
      visibility['packet-dictionary'] = false;
    } else if (visibility['packet-dictionary'] === false && logRetentionEnabled) {
      // Optional: Auto-show if enabled? or just let user toggle it.
      // For now, let's just ensure it doesn't show if disabled.
    }
  });

  async function handleToggleSection(id: string) {
    const key = id as keyof VisibilityState;
    visibility[key] = !visibility[key];

    // If we just turned it on, scroll to it
    if (visibility[key]) {
      await tick();
      const element = document.getElementById(key);
      const container = document.querySelector('.main-content'); // Assuming main-content is the scroll container
      if (element && container) {
        const CHIP_BAR_HEIGHT = 56;
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
        const offsetPosition = relativeTop - CHIP_BAR_HEIGHT;

        container.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        });
      }
    }
  }
</script>

<div class="analysis-view">
  <AnalysisChipBar {logRetentionEnabled} {visibility} onToggle={handleToggleSection} />

  {#if visibility['packet-log']}
    <div id="packet-log">
      <PacketLog {commandLogs} {parsedLogs} {packetDictionary} />
    </div>
  {/if}

  <!-- RawPacketLog handles its own internal visibility based on props -->
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

  {#if logRetentionEnabled && visibility['packet-dictionary']}
    <div id="packet-dictionary">
      <PacketDictionaryView portId={activePortId} />
    </div>
  {/if}

  {#if visibility['packet-analyzer']}
    <div id="packet-analyzer">
      <PacketAnalyzerCard {portIds} {activePortId} />
    </div>
  {/if}

  {#if visibility['cel-analyzer']}
    <div id="cel-analyzer">
      <CelAnalyzerCard {statesSnapshot} {stateOptions} />
    </div>
  {/if}
</div>

<style>
  .analysis-view {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
</style>
