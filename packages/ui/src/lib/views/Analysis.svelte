<script lang="ts">
  import type {
    CommandPacket,
    PacketStats as PacketStatsType,
    RawPacketWithInterval,
    ParsedPacket,
  } from '../types';
  import PacketStats from '../components/PacketStats.svelte';
  import PacketLog from '../components/PacketLog.svelte';

  export let stats: PacketStatsType | null;
  export let commandPackets: CommandPacket[];
  export let parsedPackets: ParsedPacket[];
  export let rawPackets: RawPacketWithInterval[];
  export let isLogPaused: boolean;
  export let togglePause: () => void;
</script>

<div class="analysis-view">
  <PacketStats {stats} />
  <PacketLog {commandPackets} {parsedPackets} {rawPackets} {isLogPaused} {togglePause} />
</div>

<style>
  .analysis-view {
    display: flex;
    flex-direction: column;
  }
</style>
