<script lang="ts">
  import EntityDetail from './EntityDetail.svelte';
  import { parseEntityKey, makeEntityKey } from '../utils/entity';
  import type {
    UnifiedEntity,
    ParsedPacket,
    CommandPacket,
    ActivityLog,
    EntityErrorEvent,
    CommandInfo,
    FrontendSettings,
    BridgeInfo,
  } from '../types';

  let {
    selectedEntityKey = $bindable<string | null>(null),
    allUnifiedEntities,
    parsedPacketLogs,
    commandPacketLogs,
    activityLogs,
    entityErrorsByKey,
    packetDictionary,
    frontendSettings,
    renamingEntityId,
    renameError,
    onRename,
    onExecute,
    onUpdate,
    logVersion,
    bridgeInfo = null,
  }: {
    selectedEntityKey: string | null;
    allUnifiedEntities: UnifiedEntity[];
    parsedPacketLogs: any[];
    commandPacketLogs: any[];
    activityLogs: ActivityLog[];
    entityErrorsByKey: Map<string, EntityErrorEvent[]>;
    packetDictionary: Record<string, string>;
    frontendSettings: FrontendSettings | null;
    renamingEntityId: string | null;
    renameError: string;
    onRename: (newName: string, updateObjectId: boolean) => void;
    onExecute: (cmd: CommandInfo, value: any) => void;
    onUpdate: (updates: Partial<UnifiedEntity>) => void;
    logVersion: number;
    bridgeInfo?: BridgeInfo | null;
  } = $props();

  const selectedEntity = $derived.by<UnifiedEntity | null>(() => {
    if (!selectedEntityKey) return null;
    const { portId, entityId, category } = parseEntityKey(selectedEntityKey);
    return (
      allUnifiedEntities.find(
        (e) => e.id === entityId && e.portId === portId && e.category === category,
      ) || null
    );
  });

  const selectedEntityErrors = $derived.by<EntityErrorEvent[]>(() => {
    if (!selectedEntity) return [];
    const key = makeEntityKey(
      selectedEntity.portId,
      selectedEntity.id,
      selectedEntity.category ?? 'entity',
    );
    return entityErrorsByKey.get(key) ?? [];
  });

  const selectedEntityParsedPackets = $derived.by<ParsedPacket[]>(() => {
    logVersion;
    return selectedEntity && selectedEntity.category === 'entity'
      ? parsedPacketLogs
          .filter(
            (p) =>
              p.entityId === selectedEntity.id &&
              (!selectedEntity.portId || !p.portId || p.portId === selectedEntity.portId),
          )
          .slice(0, 20)
          .map((log) => ({
            entityId: log.entityId,
            packet: packetDictionary[log.packetId] || '',
            state: log.state,
            timestamp: log.timestamp,
            portId: log.portId,
            timestampMs: log.timestampMs,
            timeLabel: log.timeLabel,
            searchText: log.searchText,
          }))
      : [];
  });

  const selectedEntityCommandPackets = $derived.by<CommandPacket[]>(() => {
    logVersion;
    return selectedEntity && selectedEntity.category === 'entity'
      ? commandPacketLogs
          .filter(
            (p) =>
              (p.entityId === selectedEntity.id || p.sourceEntityId === selectedEntity.id) &&
              (!selectedEntity.portId || !p.portId || p.portId === selectedEntity.portId),
          )
          .slice(0, 20)
          .map((log) => ({
            entity: log.entity,
            entityId: log.entityId,
            command: log.command,
            value: log.value,
            packet: packetDictionary[log.packetId] || '',
            timestamp: log.timestamp,
            portId: log.portId,
            timestampMs: log.timestampMs,
            timeLabel: log.timeLabel,
            searchText: log.searchText,
            sourceEntityId: log.sourceEntityId,
          }))
      : [];
  });

  const selectedEntityActivityLogs = $derived.by<ActivityLog[]>(() => {
    if (!selectedEntity) return [];
    if (selectedEntity.category === 'automation') {
      return activityLogs.filter(
        (log) =>
          log.code.startsWith('log.automation_') && log.params?.automationId === selectedEntity.id,
      );
    }
    if (selectedEntity.category === 'script') {
      return activityLogs.filter(
        (log) => log.code.startsWith('log.script_') && log.params?.scriptId === selectedEntity.id,
      );
    }
    return activityLogs.filter(
      (log) =>
        log.params?.entityId === selectedEntity.id ||
        log.params?.sourceEntityId === selectedEntity.id,
    );
  });

  $effect(() => {
    if (selectedEntityKey) {
      const { portId, entityId, category } = parseEntityKey(selectedEntityKey);
      const exists = allUnifiedEntities.some(
        (entity) =>
          entity.id === entityId && entity.portId === portId && entity.category === category,
      );
      if (!exists) {
        selectedEntityKey = null;
      }
    }
  });
</script>

{#if selectedEntity}
  <EntityDetail
    entity={selectedEntity}
    isOpen={!!selectedEntityKey}
    parsedPackets={selectedEntityParsedPackets}
    commandPackets={selectedEntityCommandPackets}
    activityLogs={selectedEntityActivityLogs}
    entityErrors={selectedEntityErrors}
    onClose={() => (selectedEntityKey = null)}
    {onExecute}
    isRenaming={renamingEntityId === selectedEntity.id}
    {renameError}
    {onRename}
    {onUpdate}
    editorMode={frontendSettings?.editor?.default ?? 'monaco'}
    {bridgeInfo}
  />
{/if}
