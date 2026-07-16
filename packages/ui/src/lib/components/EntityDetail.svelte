<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { t, locale } from 'svelte-i18n';
  import yaml from 'js-yaml';
  import Button from './Button.svelte';
  import Toggle from '$lib/components/Toggle.svelte';
  import Dialog from './Dialog.svelte';
  import MonacoYamlEditor from './MonacoYamlEditor.svelte';
  import Modal from './Modal.svelte';
  import ActivityLogList from './ActivityLogList.svelte';
  import { triggerSystemRestart as restartApp } from '../utils/appControl';
  import { formatTime, formatRelativeTime } from '../utils/time';
  import { copyToClipboard } from '../utils/clipboard';
  import type {
    UnifiedEntity,
    CommandInfo,
    ParsedPacket,
    CommandPacket,
    EntityCategory,
    ActivityLog,
    EntityErrorEvent,
    BridgeInfo,
  } from '../types';

  let {
    entity,
    parsedPackets = [],
    commandPackets = [],
    activityLogs = [],
    entityErrors = [],
    isOpen,
    isRenaming = false,
    renameError = null,
    onClose,
    onExecute,
    onRename,
    onUpdate,
    editorMode = 'monaco',
    bridgeInfo = null,
  }: {
    entity: UnifiedEntity;
    parsedPackets?: ParsedPacket[];
    commandPackets?: CommandPacket[];
    activityLogs?: ActivityLog[];
    entityErrors?: EntityErrorEvent[];
    isOpen: boolean;
    isRenaming?: boolean;
    renameError?: string | null;
    onClose?: () => void;
    onExecute?: (cmd: CommandInfo, value?: any) => void;
    onRename?: (newName: string, updateObjectId: boolean) => void;
    onUpdate?: (updates: Partial<UnifiedEntity>) => void;
    editorMode?: 'monaco' | 'textarea';
    bridgeInfo?: BridgeInfo | null;
  } = $props();

  let activeTab = $state<
    'status' | 'config' | 'packets' | 'manage' | 'execute' | 'logs' | 'details'
  >('status');

  let matterState = $state<Record<string, any> | null>(null);
  let matterStateInterval: ReturnType<typeof setInterval> | null = null;

  const integrationType = $derived.by(() => {
    if (!bridgeInfo || !entity.portId) return 'mqtt';
    const br = bridgeInfo.bridges.find((b) => b.serial?.portId === entity.portId);
    return br?.integrationType || 'mqtt';
  });

  function getPayloadObj(payload?: string): Record<string, any> {
    if (!payload) return {};
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  }

  function getDeterministicEndpoint(entityId: string): number {
    let hash = 0;
    for (let i = 0; i < entityId.length; i++) {
      hash = entityId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash % 30) + 2; // Endpoint 2 to 31
  }

  const matterDeviceDetails = $derived.by(() => {
    const payload = getPayloadObj(entity.statePayload);
    const hasBrightness =
      entity.commands.some((c) => c.commandName.includes('brightness')) || 'brightness' in payload;

    let deviceName = 'Unknown';
    let deviceCode = '0x0000';
    let clusters: string[] = ['descriptor'];

    if (entity.type === 'light') {
      if (hasBrightness) {
        deviceName = 'DimmableLight';
        deviceCode = '0x0101';
        clusters = ['groups', 'onOff', 'levelControl', 'scenesManagement', 'descriptor'];
      } else {
        deviceName = 'OnOffLight';
        deviceCode = '0x0100';
        clusters = ['groups', 'onOff', 'scenesManagement', 'descriptor'];
      }
    } else if (entity.type === 'switch' || entity.type === 'valve') {
      deviceName = 'OnOffPlugInUnit';
      deviceCode = '0x010a';
      clusters = ['groups', 'onOff', 'scenesManagement', 'descriptor'];
    } else if (entity.type === 'climate') {
      deviceName = 'Thermostat';
      deviceCode = '0x0301';
      clusters = ['thermostat', 'descriptor'];
    } else if (entity.type === 'lock') {
      deviceName = 'DoorLock';
      deviceCode = '0x000a';
      clusters = ['doorLock', 'descriptor'];
    }

    const endpointNumber = getDeterministicEndpoint(entity.id);

    // Dynamic state
    const isStateOn =
      payload.state === 'on' ||
      payload.state === 'ON' ||
      payload.state === 'OPEN' ||
      payload.state === 'open' ||
      payload.state === true ||
      payload.on === true ||
      payload.power === 'on' ||
      payload.power === 'ON';
    const hasState = 'state' in payload || 'on' in payload || 'power' in payload;
    const summaryState = hasState ? (isStateOn ? 'On' : 'Off') : 'Unknown';

    let bridgeName = 'ha2matter';
    if (bridgeInfo && entity.portId) {
      const br = bridgeInfo.bridges.find((b) => b.serial?.portId === entity.portId);
      if (br) {
        if (br.commissioning?.productName) {
          bridgeName = br.commissioning.productName;
        } else {
          const baseName = br.configFile.split('/').pop() || '';
          bridgeName = baseName.replace(/\.homenet_bridge\.yaml$/, '').replace(/\.yaml$/, '');
        }
      }
    }

    return {
      deviceName,
      deviceCode,
      summaryState,
      bridgeName,
      endpointNumber,
      clusters,
      payload,
      isStateOn,
    };
  });
  let activeTabEntityId = $state<string | null>(null);
  let editingConfig = $state('');
  let configLoading = $state(false);
  let configError = $state<string | null>(null);
  let isSaving = $state(false);
  let saveMessage = $state('');
  let mqttInfo = $state<{ topic: string; payload: unknown } | null>(null);
  let mqttLoading = $state(false);
  let mqttError = $state<string | null>(null);
  let parsedYamlConfig = $state<any>(null);
  let discoveryPreview = $state<{ topic: string; payload: unknown } | null>(null);
  let discoveryPreviewLoading = $state(false);
  let discoveryPreviewError = $state<string | null>(null);
  let renameInput = $state('');
  let renameLocalError = $state<string | null>(null);
  let renameEntityId = $state<string | null>(null);
  let updateEntityId = $state(true);
  let effectiveRenameError = $state('');
  let idCopied = $state(false);
  let isExecutingAutomation = $state(false);
  let isExecutingScript = $state(false);
  let executeMessage = $state('');
  let executeError = $state<string | null>(null);
  let isTogglingAutomation = $state(false);
  let automationToggleError = $state<string | null>(null);

  let isTogglingDiscoveryAlways = $state(false);
  let forceActiveError = $state<string | null>(null);

  let tabsContainer = $state<HTMLElement>();
  let commandInputs = $state<Record<string, any>>({});
  let scriptArgInputs = $state<Record<string, any>>({});
  let inputInitializedEntityId = $state<string | null>(null);
  let executingCommands = $state(new Set<string>());

  let showRx = $state(true);
  let showTx = $state(true);

  const formatErrorContext = (context?: Record<string, unknown>) => {
    if (!context || Object.keys(context).length === 0) return '';
    try {
      return JSON.stringify(context);
    } catch {
      return '';
    }
  };

  // Dialog State
  let dialog = $state({
    open: false,
    title: '',
    message: '',
    confirmText: undefined as string | undefined,
    variant: 'primary' as 'primary' | 'danger' | 'success',
    loading: false,
    loadingText: undefined as string | undefined,
    showCancel: true,
    onConfirm: async () => {},
    onCancel: undefined as (() => void) | undefined,
  });

  const closeDialog = () => {
    if (dialog.onCancel) {
      dialog.onCancel();
    }
    dialog.open = false;
  };

  const showAlertDialog = (
    title: string,
    message: string,
    variant: 'danger' | 'success' = 'danger',
  ) => {
    dialog.title = title;
    dialog.message = message;
    dialog.variant = variant;
    dialog.showCancel = false;
    dialog.confirmText = $t('common.confirm');
    dialog.loading = false;
    dialog.onConfirm = async () => {
      closeDialog();
    };
    dialog.onCancel = undefined;
    dialog.open = true;
  };

  const showConfirmDialog = ({
    title,
    message,
    confirmText,
    variant = 'primary',
    loadingText,
    action,
    onSuccess,
    onCancel,
  }: {
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'primary' | 'danger' | 'success';
    loadingText?: string;
    action: () => Promise<void>;
    onSuccess?: () => void;
    onCancel?: () => void;
  }) => {
    dialog.title = title;
    dialog.message = message;
    dialog.confirmText = confirmText;
    dialog.variant = variant;
    dialog.loadingText = loadingText;
    dialog.showCancel = true;
    dialog.loading = false;
    dialog.onCancel = onCancel;
    dialog.onConfirm = async () => {
      dialog.loading = true;
      try {
        await action();
        // Reset onCancel so it's not called when closing on success
        dialog.onCancel = undefined;

        if (onSuccess) {
          await onSuccess();
        } else {
          closeDialog();
        }
      } catch (err: any) {
        // Reset onCancel so it's not called when closing on error
        dialog.onCancel = undefined;
        closeDialog();
        setTimeout(() => {
          showAlertDialog(
            $t('common.error') || 'Error',
            err.message || 'An error occurred',
            'danger',
          );
        }, 300);
      } finally {
        if (!onSuccess) dialog.loading = false;
      }
    };
    dialog.open = true;
  };

  const entityCategory = $derived.by<EntityCategory>(() => entity.category ?? 'entity');
  const isDeviceEntity = $derived.by(() => entityCategory === 'entity');
  const isAutomation = $derived.by(() => entityCategory === 'automation');
  const isScript = $derived.by(() => entityCategory === 'script');
  const hasErrors = $derived(entityErrors.length > 0);

  const groupedErrors = $derived.by(() => {
    const groups = new Map<
      string,
      { error: EntityErrorEvent; count: number; latestTimestamp: number }
    >();

    for (const error of entityErrors) {
      const key = JSON.stringify({
        type: error.type,
        message: error.message,
        context: error.context,
      });

      const ts = new Date(error.timestamp).getTime();

      if (!groups.has(key)) {
        groups.set(key, { error, count: 0, latestTimestamp: ts });
      }
      const group = groups.get(key)!;
      group.count++;
      group.latestTimestamp = Math.max(group.latestTimestamp, ts);
    }

    return Array.from(groups.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  });
  const logTitle = $derived.by(() => {
    if (isAutomation) return $t('entity_detail.automation.logs_title');
    if (isScript) return $t('entity_detail.script.logs_title');
    return $t('entity_detail.entity.logs_title');
  });
  const logEmptyMessage = $derived.by(() => {
    if (isAutomation) return $t('entity_detail.automation.logs_empty');
    if (isScript) return $t('entity_detail.script.logs_empty');
    return $t('entity_detail.entity.logs_empty');
  });

  type MergedPacket = ({ type: 'rx' } & ParsedPacket) | ({ type: 'tx' } & CommandPacket);

  const getTimestampMs = (packet: ParsedPacket | CommandPacket) =>
    packet.timestampMs ?? new Date(packet.timestamp).getTime();

  const mergePackets = (rxPackets: ParsedPacket[], txPackets: CommandPacket[]) => {
    const merged: MergedPacket[] = [];
    let rxIndex = 0;
    let txIndex = 0;

    while (rxIndex < rxPackets.length || txIndex < txPackets.length) {
      const rxPacket = rxPackets[rxIndex];
      const txPacket = txPackets[txIndex];
      const rxTimestamp = rxPacket ? getTimestampMs(rxPacket) : -Infinity;
      const txTimestamp = txPacket ? getTimestampMs(txPacket) : -Infinity;

      if (txPacket === undefined || (rxPacket && rxTimestamp >= txTimestamp)) {
        merged.push({ ...rxPacket, type: 'rx' } as const);
        rxIndex += 1;
      } else if (txPacket) {
        merged.push({ ...txPacket, type: 'tx' } as const);
        txIndex += 1;
      }
    }

    return merged;
  };

  const mergedPackets = $derived.by(() => {
    const rxPackets = showRx ? parsedPackets : [];
    const txPackets = showTx ? commandPackets : [];

    return mergePackets(rxPackets, txPackets);
  });

  const lastActivityTime = $derived.by(() => {
    if (entity.category !== 'automation' && entity.category !== 'script') return null;

    for (const log of activityLogs) {
      if (
        (log.code === 'log.automation_triggered' ||
          log.code === 'log.automation_run_action_executed' ||
          log.code === 'log.automation_run_action_failed' ||
          log.code === 'log.automation_run_guard_failed') &&
        log.params?.automationId === entity.id
      ) {
        return log.timestamp;
      } else if (log.code === 'log.script_action_executed' && log.params?.scriptId === entity.id) {
        return log.timestamp;
      }
    }
    return null;
  });

  const lastActivityText = $derived.by(() => {
    if (!lastActivityTime) return null;
    let relative = formatRelativeTime(lastActivityTime, $locale ?? 'ko');
    if (relative === 'less_than_a_minute') {
      relative = $t('dashboard.entity_card.within_1_minute');
    }

    const labelKey =
      entity.category === 'automation'
        ? 'dashboard.entity_card.last_triggered'
        : 'dashboard.entity_card.last_run';

    return $t(labelKey, { values: { time: relative } });
  });

  const lastActivityTooltip = $derived.by(() => {
    if (!lastActivityTime) return null;
    return formatTime(lastActivityTime, $locale ?? undefined, {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  });

  // Use a variable to track the entity ID for which config was last loaded into the editor
  let loadedConfigEntityId = $state<string | null>(null);

  $effect(() => {
    if (entity && entity.id !== renameEntityId) {
      renameInput = entity.displayName;
      renameEntityId = entity.id;
      renameLocalError = null;
    }
  });

  $effect(() => {
    if (entity && entity.id !== activeTabEntityId) {
      activeTab = isDeviceEntity ? 'status' : 'execute';
      activeTabEntityId = entity.id;
      executeMessage = '';
      executeError = null;
    }
  });

  $effect(() => {
    effectiveRenameError = renameLocalError || renameError || '';
  });

  function handleRename() {
    const trimmed = renameInput.trim();

    if (!trimmed) {
      renameLocalError = $t('entity_detail.manage.rename.error_empty');
      return;
    }

    if (trimmed === entity.displayName) {
      renameLocalError = $t('entity_detail.manage.rename.error_same');
      return;
    }

    renameLocalError = null;
    onRename?.(trimmed, updateEntityId);
  }

  function handleExecute(cmd: CommandInfo, value?: any) {
    const key = `${cmd.entityId}-${cmd.commandName}`;
    if (executingCommands.has(key)) return;

    executingCommands.add(key);
    executingCommands = new Set(executingCommands); // Trigger reactivity

    onExecute?.(cmd, value);

    // Optimistic loading state for UX feedback
    setTimeout(() => {
      executingCommands.delete(key);
      executingCommands = new Set(executingCommands);
    }, 500);
  }

  onMount(() => {
    // Initial load if modal is already open and entity is available (unlikely onMount but good practice)
    if (isOpen && entity && activeTab === 'config' && loadedConfigEntityId !== entity.id) {
      loadRawConfig();
      loadedConfigEntityId = entity.id;
    }
  });

  $effect(() => {
    if (isOpen && entity && activeTab === 'config') {
      // Only load config if a new entity is selected OR if we're switching to the config tab for a new entity
      if (loadedConfigEntityId !== entity.id) {
        loadRawConfig();
        loadedConfigEntityId = entity.id;
      }
    } else if (!isOpen) {
      // Reset loadedConfigEntityId when the modal is closed
      loadedConfigEntityId = null;
    }
  });

  // Re-initialize command inputs only when the entity.id changes or modal opens for a *new* entity
  $effect(() => {
    if (isOpen && entity && inputInitializedEntityId !== entity.id) {
      entity.commands.forEach((cmd: CommandInfo) => {
        if (cmd.inputType === 'number') {
          commandInputs[`${cmd.entityId}_${cmd.commandName}`] = cmd.min ?? 0;
        } else if (cmd.inputType === 'select') {
          commandInputs[`${cmd.entityId}_${cmd.commandName}`] = cmd.options?.[0] ?? '';
        } else if (cmd.inputType === 'text') {
          commandInputs[`${cmd.entityId}_${cmd.commandName}`] = '';
        }
      });

      if (entity.category === 'script' && entity.args) {
        scriptArgInputs = {};
        for (const [key, arg] of Object.entries(entity.args)) {
          if (arg.default !== undefined) {
            scriptArgInputs[key] = arg.default;
          } else if (arg.type === 'number') {
            scriptArgInputs[key] = arg.min ?? 0;
          } else if (arg.type === 'select' && arg.options?.length) {
            scriptArgInputs[key] = arg.options[0];
          } else if (arg.type === 'boolean') {
            scriptArgInputs[key] = false;
          } else {
            scriptArgInputs[key] = '';
          }
        }
      }
      inputInitializedEntityId = entity.id;
    } else if (!isOpen) {
      inputInitializedEntityId = null;
    }
  });

  async function loadRawConfig() {
    configLoading = true;
    configError = null;
    saveMessage = '';
    try {
      const res = await fetch(`./api/config/raw/${entityCategory}/${entity.id}`);
      if (!res.ok) throw new Error('Failed to load config');
      const data = await res.json();
      editingConfig = data.yaml;
      configLoading = false;
    } catch (err) {
      configError = $t('entity_detail.config.load_error');
      configLoading = false;
    }
  }

  async function loadMqttInfo() {
    mqttLoading = true;
    mqttError = null;
    mqttInfo = null;
    parsedYamlConfig = null;
    try {
      let yamlToPreview = editingConfig;
      if (!yamlToPreview || loadedConfigEntityId !== entity.id) {
        const res = await fetch(`./api/config/raw/${entityCategory}/${entity.id}`);
        if (!res.ok) throw new Error('Failed to load entity config');
        const data = await res.json();
        yamlToPreview = data.yaml;
        editingConfig = data.yaml;
        loadedConfigEntityId = entity.id;
      }

      try {
        parsedYamlConfig = yaml.load(yamlToPreview);
      } catch (err) {
        console.error('Failed to parse entity YAML config', err);
      }

      const response = await fetch('./api/config/discovery-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          portId: entity.portId,
          entityType: entity.type,
          yaml: yamlToPreview,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate discovery preview');
      }

      mqttInfo = {
        topic: data.topic,
        payload: data.payload,
      };
    } catch (e) {
      mqttError = e instanceof Error ? e.message : String(e);
    } finally {
      mqttLoading = false;
    }
  }

  async function loadMatterState() {
    if (!entity || !entity.id) return;
    try {
      const res = await fetch(`./api/entities/${entity.id}/matter-state`);
      if (res.ok) {
        const data = await res.json();
        matterState = data.state || null;
      }
    } catch (e) {
      console.error('Failed to load Matter state', e);
    }
  }

  $effect(() => {
    if (isOpen && entity && activeTab === 'details') {
      loadMqttInfo();
      loadMatterState();

      if (matterStateInterval) clearInterval(matterStateInterval);
      matterStateInterval = setInterval(loadMatterState, 3000);
    } else {
      if (matterStateInterval) {
        clearInterval(matterStateInterval);
        matterStateInterval = null;
      }
    }

    return () => {
      if (matterStateInterval) {
        clearInterval(matterStateInterval);
        matterStateInterval = null;
      }
    };
  });

  async function triggerSystemRestart() {
    dialog.title = $t('settings.app_control.restart');
    dialog.message = $t('settings.app_control.restarting');
    dialog.loadingText = $t('settings.app_control.restarting');
    dialog.variant = 'primary';
    dialog.showCancel = false;
    dialog.loading = true;
    dialog.open = true;
    await restartApp();
  }

  function handleRestart(onCancel?: () => void) {
    showConfirmDialog({
      title: $t('entity_detail.config.restart_title') || 'Restart Required',
      message:
        $t('entity_detail.config.restart_confirm') ||
        'Do you want to restart the bridge to apply changes?',
      confirmText: $t('entity_detail.config.restart_button') || 'Restart',
      variant: 'primary',
      loadingText: $t('settings.app_control.restarting'),
      action: async () => triggerSystemRestart(),
      onSuccess: () => {
        // triggerSystemRestart handled the feedback
      },
      onCancel,
    });
  }

  // Alias for backward compatibility or clarity if needed, or just replace usages.
  const promptForRestart = handleRestart;

  async function saveConfig() {
    if (!editingConfig) return;

    isSaving = true;
    configError = null;
    saveMessage = '';

    try {
      const res = await fetch('./api/config/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: entity.id,
          yaml: editingConfig,
          portId: entity.portId,
          type: entityCategory,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || $t('entity_detail.config.save_error'));
      }

      saveMessage = $t('entity_detail.config.save_success', { values: { backup: data.backup } });

      promptForRestart();
    } catch (err) {
      configError = err instanceof Error ? err.message : $t('entity_detail.config.save_error');
    } finally {
      isSaving = false;
    }
  }

  async function previewDiscoveryPublish() {
    if (!isDeviceEntity || !entity.type) return;

    if (!entity.portId) {
      discoveryPreviewError = $t('errors.BRIDGE_NOT_FOUND_FOR_PORT', {
        values: { portId: 'active' },
      });
      return;
    }

    discoveryPreviewLoading = true;
    discoveryPreviewError = null;
    discoveryPreview = null;

    try {
      const response = await fetch('./api/config/discovery-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          portId: entity.portId,
          entityType: entity.type,
          yaml: editingConfig,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate discovery preview');
      }

      discoveryPreview = {
        topic: data.topic,
        payload: data.payload,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      discoveryPreviewError = $t('entity_detail.config.discovery_preview_error', {
        values: { error: message },
      });
    } finally {
      discoveryPreviewLoading = false;
    }
  }

  $effect(() => {
    editingConfig;
    discoveryPreview = null;
    discoveryPreviewError = null;
  });

  function handleRevokeDiscovery() {
    showConfirmDialog({
      title: $t('entity_detail.manage.revoke.title'),
      message: $t('entity_detail.manage.revoke.confirm'),
      confirmText: $t('entity_detail.manage.revoke.button'),
      variant: 'danger',
      action: async () => {
        const res = await fetch(`./api/entities/${entity.id}/revoke-discovery`, { method: 'POST' });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || $t('entity_detail.manage.revoke.error'));
        }
      },
      onSuccess: () => {
        showAlertDialog(
          $t('common.success') || 'Success',
          $t('entity_detail.manage.revoke.success'),
          'success',
        );
      },
    });
  }

  function handleDeleteEntity() {
    showConfirmDialog({
      title: $t('entity_detail.manage.delete.title'),
      message: $t('entity_detail.manage.delete.confirm'),
      confirmText: $t('entity_detail.manage.delete.button'),
      variant: 'danger',
      action: async () => {
        const deleteUrl = entity.portId
          ? `./api/entities/${entity.id}?portId=${encodeURIComponent(entity.portId)}`
          : `./api/entities/${entity.id}`;
        const res = await fetch(deleteUrl, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || $t('entity_detail.manage.delete.error'));
        }
      },
      onSuccess: () => {
        promptForRestart(() => {
          // On cancel of restart, close the entity detail modal because the entity is gone
          close();
        });
      },
    });
  }

  async function handleExecuteAutomation() {
    if (isExecutingAutomation) return;
    isExecutingAutomation = true;
    executeMessage = '';
    executeError = null;

    try {
      const res = await fetch('./api/automations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automationId: entity.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || $t('entity_detail.execute.error'));
      }
      executeMessage = $t('entity_detail.automation.execute_success');
    } catch (err) {
      executeError = err instanceof Error ? err.message : $t('entity_detail.execute.error');
    } finally {
      isExecutingAutomation = false;
    }
  }

  async function handleExecuteScript() {
    if (isExecutingScript) return;
    isExecutingScript = true;
    executeMessage = '';
    executeError = null;

    try {
      const res = await fetch('./api/scripts/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: entity.id, args: scriptArgInputs }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || $t('entity_detail.execute.error'));
      }
      executeMessage = $t('entity_detail.script.execute_success');
    } catch (err) {
      executeError = err instanceof Error ? err.message : $t('entity_detail.execute.error');
    } finally {
      isExecutingScript = false;
    }
  }

  async function handleToggleAutomationEnabled(newValue: boolean) {
    // No optimistic update - wait for restart
    isTogglingAutomation = true;
    automationToggleError = null;

    try {
      const res = await fetch(`./api/automations/${entity.id}/enabled`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newValue }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || $t('entity_detail.automation.toggle_error'));
      }

      promptForRestart();
    } catch (err) {
      automationToggleError =
        err instanceof Error ? err.message : $t('entity_detail.automation.toggle_error');
    } finally {
      isTogglingAutomation = false;
    }
  }

  function handleDeleteAutomation() {
    showConfirmDialog({
      title: $t('entity_detail.automation.delete_title'),
      message: $t('entity_detail.automation.delete_confirm'),
      confirmText: $t('entity_detail.automation.delete_button'),
      variant: 'danger',
      action: async () => {
        const res = await fetch(`./api/automations/${entity.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || $t('entity_detail.automation.delete_error'));
        }
      },
      onSuccess: () => {
        close();
        window.location.reload();
      },
    });
  }

  function handleDeleteScript() {
    showConfirmDialog({
      title: $t('entity_detail.script.delete_title'),
      message: $t('entity_detail.script.delete_confirm'),
      confirmText: $t('entity_detail.script.delete_button'),
      variant: 'danger',
      action: async () => {
        const res = await fetch(`./api/scripts/${entity.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || $t('entity_detail.script.delete_error'));
        }
      },
      onSuccess: () => {
        close();
        window.location.reload();
      },
    });
  }

  async function handleToggleDiscoveryAlways(newValue: boolean) {
    const oldValue = entity.discoveryAlways;
    // Optimistic update
    entity.discoveryAlways = newValue;

    isTogglingDiscoveryAlways = true;
    forceActiveError = null;

    try {
      const res = await fetch(`./api/entities/${entity.id}/discovery-always`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: newValue,
          portId: entity.portId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || $t('entity_detail.manage.force_active.error'));
      }

      onUpdate?.({ discoveryAlways: newValue });

      promptForRestart();
    } catch (err) {
      forceActiveError =
        err instanceof Error ? err.message : $t('entity_detail.manage.force_active.error');
      // Revert on error
      entity.discoveryAlways = oldValue;
    } finally {
      isTogglingDiscoveryAlways = false;
    }
  }

  function close() {
    onClose?.();
  }

  function parsePayload(payload?: string) {
    if (!payload) return [];
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.entries(parsed).map(([key, value]) => ({ key, value }));
      }
    } catch (e) {
      // ignore
    }
    return [{ key: 'Raw', value: payload }];
  }

  async function handleCopyId() {
    const success = await copyToClipboard(entity.id);
    if (success) {
      idCopied = true;
      setTimeout(() => (idCopied = false), 2000);
    } else {
      console.error('Failed to copy ID');
    }
  }

  function handleTabKeydown(e: KeyboardEvent) {
    if (!tabsContainer) return;
    const tabs = Array.from(tabsContainer.querySelectorAll('[role="tab"]')) as HTMLElement[];
    if (tabs.length === 0) return;

    const index = tabs.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;

    let nextIndex = index;

    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    e.preventDefault();
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  }

  let copiedPacket = $state<string | null>(null);
  let copyTimeout: ReturnType<typeof setTimeout>;

  async function copyPacket(packet: string) {
    const success = await copyToClipboard(packet);
    if (success) {
      copiedPacket = packet;

      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copiedPacket = null;
      }, 2000);
    }
  }

  function formatEntityType(type: string) {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  const currentTypeLabel = $derived.by<string | null>(() => {
    if (isAutomation) return 'Automation';
    if (isScript) return 'Script';
    return entity.type ? formatEntityType(entity.type) : null;
  });

  const currentDocUrl = $derived.by<string | null>(() => {
    const baseUrl = 'https://homenet2mqtt-docs.vercel.app';
    if (isAutomation) return `${baseUrl}/guide/automation.html`;
    if (isScript) return `${baseUrl}/guide/scripts.html`;
    if (entity.type) return `${baseUrl}/config/${entity.type.replace('_', '-')}.html`;
    return null;
  });

  // Matter cluster detailed dynamic definitions for expanding UI details
  const clusterDetailsData = $derived.by<Record<string, any>>(() => {
    const payload = getPayloadObj(entity.statePayload);
    const isStateOn =
      payload.state === 'on' ||
      payload.state === 'ON' ||
      payload.state === 'OPEN' ||
      payload.state === 'open' ||
      payload.state === true ||
      payload.on === true ||
      payload.power === 'on' ||
      payload.power === 'ON';

    const brightnessVal =
      payload.brightness !== undefined ? Math.round((payload.brightness / 100) * 254) : 254;

    const temperatureVal =
      payload.temperature !== undefined ? Math.round(payload.temperature * 100) : 2100;

    const lockStateVal = payload.lock === 'locked' ? 1 : 2;

    const groupsData = matterState?.groups || {};
    const onOffData = matterState?.onOff || {};
    const levelControlData = matterState?.levelControl || {};
    const scenesManagementData = matterState?.scenesManagement || {};
    const thermostatData = matterState?.thermostat || {};
    const doorLockData = matterState?.doorLock || {};
    const descriptorData = matterState?.descriptor || {};

    return {
      groups: {
        clusterRevision: 4,
        featureMap: { groupNames: true },
        nameSupport: { nameSupport: true },
        attributeList: [
          'groupList',
          'nameSupport',
          'featureMap',
          'clusterRevision',
          'attributeList',
          'acceptedCommandList',
        ],
        acceptedCommandList: [
          'addGroup',
          'viewGroup',
          'getGroupMembership',
          'removeGroup',
          'removeAllGroups',
          'addGroupIfIdentifying',
        ],
        generatedCommandList: [
          'addGroupResponse',
          'viewGroupResponse',
          'getGroupMembershipResponse',
          'removeGroupResponse',
        ],
        ...groupsData,
      },
      onOff: {
        onOff: isStateOn,
        clusterRevision: 6,
        featureMap: { levelControl: true, lighting: true, scenes: true },
        globalSceneControl: false,
        onTime: 0,
        offWaitTime: 0,
        startUpOnOff: null,
        attributeList: [
          'onOff',
          'globalSceneControl',
          'onTime',
          'offWaitTime',
          'startUpOnOff',
          'featureMap',
          'clusterRevision',
          'attributeList',
          'acceptedCommandList',
          'generatedCommandList',
        ],
        acceptedCommandList: [
          'off',
          'on',
          'toggle',
          'offWithEffect',
          'onWithRecallGlobalScene',
          'onWithTimedOff',
        ],
        generatedCommandList: [],
        ...onOffData,
      },
      levelControl: {
        currentLevel: brightnessVal,
        clusterRevision: 5,
        remainingTime: 0,
        minLevel: 1,
        maxLevel: 254,
        featureMap: { onOff: true },
        attributeList: [
          'currentLevel',
          'remainingTime',
          'minLevel',
          'maxLevel',
          'currentFrequency',
          'minFrequency',
          'maxFrequency',
          'options',
          'onOffTransitionTime',
          'onLevel',
          'onTransitionTime',
          'offTransitionTime',
          'defaultMoveRate',
          'startUpCurrentLevel',
          'featureMap',
        ],
        acceptedCommandList: ['moveToLevel', 'move', 'step', 'stop', 'moveToLevelWithOnOff'],
        ...levelControlData,
      },
      scenesManagement: {
        sceneTable: [],
        featureMap: { scenes: true },
        clusterRevision: 1,
        sceneTableSize: 128,
        fabricSceneInfo: [
          'fabricIndex: 1',
          'sceneCount: 0',
          'currentScene: 0',
          'currentGroup: 0',
          'sceneValid: false',
        ],
        attributeList: [
          'sceneCount',
          'currentScene',
          'currentGroup',
          'sceneValid',
          'sceneTableSize',
          'fabricSceneInfo',
          'clusterRevision',
        ],
        acceptedCommandList: [
          'addScene',
          'viewScene',
          'removeScene',
          'removeAllScenes',
          'storeScene',
          'recallScene',
          'getSceneMembership',
          'copyScene',
        ],
        generatedCommandList: [
          'addSceneResponse',
          'viewSceneResponse',
          'removeSceneResponse',
          'removeAllScenesResponse',
          'storeSceneResponse',
          'getSceneMembershipResponse',
          'copySceneResponse',
        ],
        ...scenesManagementData,
      },
      thermostat: {
        localTemperature: temperatureVal,
        occupiedHeatingSetpoint:
          payload.target_temperature !== undefined
            ? Math.round(payload.target_temperature * 100)
            : 2000,
        occupiedCoolingSetpoint:
          payload.target_temperature !== undefined
            ? Math.round(payload.target_temperature * 100)
            : 2400,
        systemMode: payload.mode || 'off',
        clusterRevision: 6,
        featureMap: {
          heating: entity.commands?.some((c) => c.commandName.includes('heat')) ?? true,
          cooling: entity.commands?.some((c) => c.commandName.includes('cool')) ?? false,
          autoMode: entity.commands?.some((c) => c.commandName.includes('auto')) ?? false,
        },
        attributeList: [
          'localTemperature',
          'occupiedCoolingSetpoint',
          'occupiedHeatingSetpoint',
          'systemMode',
          'controlSequenceOfOperation',
          'thermostatRunningMode',
          'startOfWeek',
          'numberOfWeeklyTransitions',
          'numberOfDailyTransitions',
          'temperatureSetpointHold',
          'temperatureSetpointHoldDuration',
          'thermostatRunningState',
        ],
        acceptedCommandList: [
          'setpointRaiseLower',
          'setWeeklySchedule',
          'getWeeklySchedule',
          'clearWeeklySchedule',
        ],
        ...thermostatData,
      },
      doorLock: {
        lockState: lockStateVal,
        clusterRevision: 6,
        lockType: 0,
        featureMap: { lockState: true },
        attributeList: [
          'lockState',
          'lockType',
          'actuatorEnabled',
          'doorState',
          'doorOpenEvents',
          'doorClosedEvents',
          'openPeriod',
          'featureMap',
        ],
        acceptedCommandList: ['lockDoor', 'unlockDoor'],
        ...doorLockData,
      },
      descriptor: {
        clusterRevision: 3,
        featureMap: { tagList: true },
        deviceTypeList: [`deviceType: ${matterDeviceDetails.deviceCode}`, 'revision: 1'],
        serverList: matterDeviceDetails.clusters,
        clientList: [],
        partsList: [],
        attributeList: [
          'deviceTypeList',
          'serverList',
          'clientList',
          'partsList',
          'featureMap',
          'clusterRevision',
          'attributeList',
          'acceptedCommandList',
          'generatedCommandList',
        ],
        acceptedCommandList: [],
        generatedCommandList: [],
        ...descriptorData,
      },
    };
  });

  let expandedAttrs = $state<Record<string, boolean>>({});

  function toggleAttr(clusterName: string, attrKey: string) {
    const key = `${clusterName}:${attrKey}`;
    expandedAttrs[key] = !expandedAttrs[key];
  }
</script>

<Modal open={isOpen} width="1400px" onclose={close} oncancel={close}>
  <div class="modal-content-wrapper">
    <header class="modal-header">
      <div class="header-info">
        <h2 id="modal-title">{entity.displayName}</h2>
        <div class="code-wrapper">
          <span class="entity-id">{entity.id}</span>
          <button
            class="copy-btn"
            onclick={handleCopyId}
            title={$t('entity_detail.copy_id') || 'Click to copy ID'}
            aria-label={$t('entity_detail.copy_id_aria', { values: { id: entity.id } }) ||
              `Copy ID ${entity.id}`}
          >
            {#if idCopied}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="success-icon"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            {/if}
          </button>
        </div>
      </div>
      <button class="close-btn" onclick={close} aria-label={$t('entity_detail.close_aria')}
        >&times;</button
      >
    </header>

    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="modal-tabs"
      role="tablist"
      tabindex="-1"
      bind:this={tabsContainer}
      onkeydown={handleTabKeydown}
    >
      {#if isDeviceEntity}
        <button
          role="tab"
          id="tab-status"
          aria-selected={activeTab === 'status'}
          aria-controls="panel-status"
          tabindex={activeTab === 'status' ? 0 : -1}
          class:active={activeTab === 'status'}
          onclick={() => (activeTab = 'status')}>{$t('entity_detail.tabs.status')}</button
        >

        <button
          role="tab"
          id="tab-details"
          aria-selected={activeTab === 'details'}
          aria-controls="panel-details"
          tabindex={activeTab === 'details' ? 0 : -1}
          class:active={activeTab === 'details'}
          onclick={() => (activeTab = 'details')}>{$t('entity_detail.tabs.details')}</button
        >
      {:else}
        <button
          role="tab"
          id="tab-execute"
          aria-selected={activeTab === 'execute'}
          aria-controls="panel-execute"
          tabindex={activeTab === 'execute' ? 0 : -1}
          class:active={activeTab === 'execute'}
          onclick={() => (activeTab = 'execute')}
          >{$t(
            isAutomation || isScript
              ? 'entity_detail.tabs.status_run'
              : 'entity_detail.tabs.execute',
          )}</button
        >
      {/if}
      <button
        role="tab"
        id="tab-config"
        aria-selected={activeTab === 'config'}
        aria-controls="panel-config"
        tabindex={activeTab === 'config' ? 0 : -1}
        class:active={activeTab === 'config'}
        onclick={() => (activeTab = 'config')}>{$t('entity_detail.tabs.config')}</button
      >
      <button
        role="tab"
        id="tab-logs"
        aria-selected={activeTab === 'logs'}
        aria-controls="panel-logs"
        tabindex={activeTab === 'logs' ? 0 : -1}
        class:active={activeTab === 'logs'}
        onclick={() => (activeTab = 'logs')}
        >{$t('entity_detail.tabs.logs')}{#if hasErrors}❗{/if}</button
      >
      {#if isDeviceEntity}
        <button
          role="tab"
          id="tab-packets"
          aria-selected={activeTab === 'packets'}
          aria-controls="panel-packets"
          tabindex={activeTab === 'packets' ? 0 : -1}
          class:active={activeTab === 'packets'}
          onclick={() => (activeTab = 'packets')}>{$t('entity_detail.tabs.packets')}</button
        >
      {/if}
      <button
        role="tab"
        id="tab-manage"
        aria-selected={activeTab === 'manage'}
        aria-controls="panel-manage"
        tabindex={activeTab === 'manage' ? 0 : -1}
        class:active={activeTab === 'manage'}
        onclick={() => (activeTab = 'manage')}>{$t('entity_detail.tabs.manage')}</button
      >
    </div>

    <div class="modal-body">
      {#if activeTab === 'status'}
        <div role="tabpanel" id="panel-status" aria-labelledby="tab-status" tabindex="0">
          <div class="section status-section">
            <h3>{$t('entity_detail.status.title')}</h3>
            <div class="payload-list">
              {#each parsePayload(entity.statePayload) as item (item.key)}
                <div class="payload-item">
                  <span class="payload-key">{item.key}</span>
                  <span class="payload-value">{item.value}</span>
                </div>
              {/each}
              {#if !entity.statePayload && entity.type !== 'button'}
                <div class="no-data">{$t('entity_detail.status.no_data')}</div>
              {/if}
            </div>
          </div>

          {#if entity.commands.length > 0}
            <div class="section command-section">
              <h3>{$t('entity_detail.status.command_title')}</h3>
              <div class="command-grid">
                {#each entity.commands as cmd (`${cmd.entityId}-${cmd.commandName}`)}
                  <div class="command-item">
                    {#if cmd.inputType === 'number'}
                      <div class="input-group">
                        <label for={`cmd-${cmd.entityId}-${cmd.commandName}`}
                          >{cmd.commandName.replace('command_', '')}</label
                        >
                        <input
                          id={`cmd-${cmd.entityId}-${cmd.commandName}`}
                          type="number"
                          min={cmd.min}
                          max={cmd.max}
                          step={cmd.step}
                          bind:value={commandInputs[`${cmd.entityId}_${cmd.commandName}`]}
                        />
                        <Button
                          variant="primary"
                          onclick={() =>
                            handleExecute(cmd, commandInputs[`${cmd.entityId}_${cmd.commandName}`])}
                          isLoading={executingCommands.has(`${cmd.entityId}-${cmd.commandName}`)}
                          ariaLabel={$t('entity_detail.status.send_aria', {
                            values: { command: cmd.displayName },
                          })}
                        >
                          {$t('entity_detail.status.send')}
                        </Button>
                      </div>
                    {:else if cmd.inputType === 'select'}
                      <div class="input-group">
                        <label for={`cmd-${cmd.entityId}-${cmd.commandName}`}
                          >{cmd.commandName.replace('command_', '')}</label
                        >
                        <select
                          id={`cmd-${cmd.entityId}-${cmd.commandName}`}
                          bind:value={commandInputs[`${cmd.entityId}_${cmd.commandName}`]}
                        >
                          {#each cmd.options ?? [] as option}
                            <option value={option}>{option}</option>
                          {/each}
                        </select>
                        <Button
                          variant="primary"
                          onclick={() =>
                            handleExecute(cmd, commandInputs[`${cmd.entityId}_${cmd.commandName}`])}
                          isLoading={executingCommands.has(`${cmd.entityId}-${cmd.commandName}`)}
                          ariaLabel={$t('entity_detail.status.send_aria', {
                            values: { command: cmd.displayName },
                          })}
                        >
                          {$t('entity_detail.status.send')}
                        </Button>
                      </div>
                    {:else if cmd.inputType === 'text'}
                      <div class="input-group">
                        <label for={`cmd-${cmd.entityId}-${cmd.commandName}`}
                          >{cmd.commandName.replace('command_', '')}</label
                        >
                        <input
                          id={`cmd-${cmd.entityId}-${cmd.commandName}`}
                          type="text"
                          bind:value={commandInputs[`${cmd.entityId}_${cmd.commandName}`]}
                        />
                        <Button
                          variant="primary"
                          onclick={() =>
                            handleExecute(cmd, commandInputs[`${cmd.entityId}_${cmd.commandName}`])}
                          isLoading={executingCommands.has(`${cmd.entityId}-${cmd.commandName}`)}
                          ariaLabel={$t('entity_detail.status.send_aria', {
                            values: { command: cmd.displayName },
                          })}
                        >
                          {$t('entity_detail.status.send')}
                        </Button>
                      </div>
                    {:else}
                      <Button
                        variant="secondary"
                        fullWidth
                        class="cmd-btn"
                        onclick={() => handleExecute(cmd)}
                        isLoading={executingCommands.has(`${cmd.entityId}-${cmd.commandName}`)}
                      >
                        {cmd.displayName}
                      </Button>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else if activeTab === 'execute'}
        <div role="tabpanel" id="panel-execute" aria-labelledby="tab-execute" tabindex="0">
          <div class="section status-section">
            {#if entity.description}
              <p class="description-text">{entity.description}</p>
            {/if}
            {#if lastActivityText}
              <p class="activity-text" title={lastActivityTooltip ?? undefined}>
                <span class="icon">🕒</span>
                {lastActivityText}
              </p>
            {/if}

            {#if isAutomation}
              <h3>{$t('entity_detail.automation.execute_title')}</h3>
              <p class="subtle">{$t('entity_detail.automation.execute_desc')}</p>
              <Button
                variant="primary"
                onclick={handleExecuteAutomation}
                isLoading={isExecutingAutomation}
              >
                {$t('entity_detail.automation.execute_button')}
              </Button>
            {:else if isScript}
              <h3>{$t('entity_detail.script.execute_title')}</h3>
              <p class="subtle">{$t('entity_detail.script.execute_desc')}</p>

              {#if entity.args}
                <div class="script-args">
                  {#each Object.entries(entity.args) as [key, arg]}
                    <div class="input-group">
                      <label for={`arg-${key}`}>
                        {key}
                        {#if arg.description}
                          <span class="arg-desc">({arg.description})</span>
                        {/if}
                      </label>

                      {#if arg.type === 'select'}
                        <select id={`arg-${key}`} bind:value={scriptArgInputs[key]}>
                          {#each arg.options ?? [] as option}
                            <option value={option}>{option}</option>
                          {/each}
                        </select>
                      {:else if arg.type === 'boolean'}
                        <div class="toggle-wrapper">
                          <Toggle
                            id={`arg-${key}`}
                            checked={scriptArgInputs[key]}
                            onchange={(checked: boolean) => (scriptArgInputs[key] = checked)}
                          />
                        </div>
                      {:else if arg.type === 'number'}
                        <input
                          id={`arg-${key}`}
                          type="number"
                          bind:value={scriptArgInputs[key]}
                          min={arg.min}
                          max={arg.max}
                        />
                      {:else}
                        <input id={`arg-${key}`} type="text" bind:value={scriptArgInputs[key]} />
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}

              <Button variant="primary" onclick={handleExecuteScript} isLoading={isExecutingScript}>
                {$t('entity_detail.script.execute_button')}
              </Button>
            {/if}
            {#if executeMessage}
              <div class="save-message success">{executeMessage}</div>
            {/if}
            {#if executeError}
              <div class="save-message error">{executeError}</div>
            {/if}
          </div>
        </div>
      {:else if activeTab === 'details'}
        <div role="tabpanel" id="panel-details" aria-labelledby="tab-details" tabindex="0">
          <div class="section details-section">
            <!-- 1. 기기 설정 요약 (공통) -->
            <div class="detail-section-title">{$t('entity_detail.mqtt.config_summary')}</div>
            <div class="summary-grid">
              <div class="summary-item">
                <span class="summary-label">{$t('entity_detail.mqtt.port_id')}</span>
                <span class="summary-value">{entity.portId || $t('entity_detail.mqtt.none')}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">{$t('entity_detail.mqtt.type')}</span>
                <span class="summary-value">{entity.type || $t('entity_detail.mqtt.none')}</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">{$t('entity_detail.mqtt.optimistic')}</span>
                <span class="summary-value">
                  {#if parsedYamlConfig && parsedYamlConfig.optimistic === true}
                    {$t('entity_detail.mqtt.yes')}
                  {:else}
                    {$t('entity_detail.mqtt.no')}
                  {/if}
                </span>
              </div>
              <div class="summary-item">
                <span class="summary-label">{$t('entity_detail.mqtt.internal')}</span>
                <span class="summary-value">
                  {#if entity.internal === true}
                    {$t('entity_detail.mqtt.yes')}
                  {:else}
                    {$t('entity_detail.mqtt.no')}
                  {/if}
                </span>
              </div>
              <div class="summary-item">
                <span class="summary-label">{$t('entity_detail.mqtt.discovery_always')}</span>
                <span class="summary-value">
                  {#if entity.discoveryAlways === true}
                    {$t('entity_detail.mqtt.yes')}
                  {:else}
                    {$t('entity_detail.mqtt.no')}
                  {/if}
                </span>
              </div>
              <div class="summary-item">
                <span class="summary-label">{$t('entity_detail.mqtt.device_class')}</span>
                <span class="summary-value">
                  {(parsedYamlConfig && parsedYamlConfig.device_class) ||
                    $t('entity_detail.mqtt.none')}
                </span>
              </div>
              <div class="summary-item">
                <span class="summary-label">{$t('entity_detail.mqtt.icon')}</span>
                <span class="summary-value">
                  {(parsedYamlConfig && parsedYamlConfig.icon) || $t('entity_detail.mqtt.none')}
                </span>
              </div>
            </div>

            <!-- 2. 조건부 노출 영역 (MQTT vs Matter) -->
            {#if integrationType === 'matter'}
              <div class="entity-detail-section mt-6">
                <!-- Premium Matter Header Card -->
                <div class="entity-header-card">
                  <div class="entity-title-row">
                    <div class="device-type-badge">
                      <span class="device-icon">⚡</span>
                      <span class="device-name">{matterDeviceDetails.deviceName}</span>
                      <span class="device-code">({matterDeviceDetails.deviceCode})</span>
                    </div>
                    <div class="status-badge" class:on={matterDeviceDetails.isStateOn}>
                      {matterDeviceDetails.summaryState}
                    </div>
                  </div>
                  <div class="entity-info-row">
                    <div class="info-item">
                      <span class="info-label">Name</span>
                      <span class="info-value text-highlight">{entity.displayName}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">Entity ID</span>
                      <span class="info-value font-mono">{entity.id}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{$t('entity_detail.matter.bridge')}</span>
                      <span class="info-value">{matterDeviceDetails.bridgeName}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{$t('entity_detail.matter.endpoint')}</span>
                      <span class="info-value font-bold">{matterDeviceDetails.endpointNumber}</span>
                    </div>
                  </div>
                </div>

                <!-- Clusters Header -->
                <div class="clusters-header">
                  <h3>
                    {$t('entity_detail.matter.clusters', {
                      values: { count: matterDeviceDetails.clusters.length },
                    })}
                  </h3>
                  <div class="clusters-list-horizontal">
                    {#each matterDeviceDetails.clusters as cluster}
                      <span class="cluster-pill">{cluster}</span>
                    {/each}
                  </div>
                </div>

                <div class="detail-section-title font-medium mt-4">
                  {$t('entity_detail.matter.title')}
                </div>
                <div class="matter-status-card">
                  <div class="matter-status-item">
                    <span class="matter-label">{$t('entity_detail.matter.state')}:</span>
                    <span class="matter-value" class:on={matterDeviceDetails.isStateOn}>
                      {matterDeviceDetails.payload.state ||
                        (matterDeviceDetails.isStateOn ? 'on' : 'off')}
                    </span>
                  </div>
                  <div class="matter-status-item">
                    <span class="matter-label">{$t('entity_detail.matter.device_type')}:</span>
                    <span class="matter-value"
                      >{matterDeviceDetails.deviceName} ({matterDeviceDetails.deviceCode})</span
                    >
                  </div>
                  <div class="matter-status-item">
                    <span class="matter-label">{$t('entity_detail.matter.endpoint')}:</span>
                    <span class="matter-value font-mono">{matterDeviceDetails.endpointNumber}</span>
                  </div>
                </div>

                <!-- Clusters Details -->
                <div class="clusters-grid mt-4">
                  {#each matterDeviceDetails.clusters as cluster}
                    <div class="cluster-card">
                      <div class="cluster-card-header">
                        <span class="cluster-icon">⚙️</span>
                        <span class="cluster-name">{cluster}</span>
                      </div>
                      <div class="cluster-card-body">
                        <!-- Dynamic Main Attribute Highlights -->
                        {#if cluster === 'onOff'}
                          <div class="attribute-item highlight">
                            <span class="attr-key">onOff</span>
                            <span
                              class="attr-val font-mono text-bold"
                              class:on={matterDeviceDetails.isStateOn}
                            >
                              {matterDeviceDetails.isStateOn}
                            </span>
                          </div>
                        {:else if cluster === 'levelControl'}
                          <div class="attribute-item highlight">
                            <span class="attr-key">currentLevel</span>
                            <span class="attr-val font-mono font-bold">
                              {matterDeviceDetails.payload.brightness !== undefined
                                ? Math.round((matterDeviceDetails.payload.brightness / 100) * 254)
                                : 254}
                            </span>
                          </div>
                        {:else if cluster === 'thermostat'}
                          <div class="attribute-item highlight">
                            <span class="attr-key">localTemperature</span>
                            <span class="attr-val font-mono font-bold">
                              {matterDeviceDetails.payload.temperature !== undefined
                                ? Math.round(matterDeviceDetails.payload.temperature * 100)
                                : 2100}
                            </span>
                          </div>
                        {:else if cluster === 'doorLock'}
                          <div class="attribute-item highlight">
                            <span class="attr-key">lockState</span>
                            <span
                              class="attr-val font-mono font-bold"
                              class:on={matterDeviceDetails.payload.lock === 'locked'}
                            >
                              {matterDeviceDetails.payload.lock === 'locked' ? 1 : 2}
                            </span>
                          </div>
                        {/if}

                        <!-- Loop and Render Detailed Collapsible Attributes -->
                        {#if clusterDetailsData[cluster]}
                          {#each Object.entries(clusterDetailsData[cluster]) as [key, val]}
                            {#if Array.isArray(val)}
                              <div
                                class="attribute-item flex-col"
                                onclick={() => toggleAttr(cluster, key)}
                                role="button"
                                tabindex="0"
                                onkeydown={(e) => e.key === 'Enter' && toggleAttr(cluster, key)}
                              >
                                <div class="attribute-row-header">
                                  <span class="attr-key">{key}</span>
                                  <span class="attr-val text-muted hover-highlight"
                                    >[{val.length} items] {expandedAttrs[`${cluster}:${key}`]
                                      ? '▲'
                                      : '▼'}</span
                                  >
                                </div>
                                {#if expandedAttrs[`${cluster}:${key}`]}
                                  <div class="expanded-details">
                                    {#if val.length === 0}
                                      <span class="empty-text">Empty</span>
                                    {:else}
                                      <ul>
                                        {#each val as item}
                                          <li>{item}</li>
                                        {/each}
                                      </ul>
                                    {/if}
                                  </div>
                                {/if}
                              </div>
                            {:else if typeof val === 'object' && val !== null}
                              <div
                                class="attribute-item flex-col"
                                onclick={() => toggleAttr(cluster, key)}
                                role="button"
                                tabindex="0"
                                onkeydown={(e) => e.key === 'Enter' && toggleAttr(cluster, key)}
                              >
                                <div class="attribute-row-header">
                                  <span class="attr-key">{key}</span>
                                  <span class="attr-val text-muted hover-highlight"
                                    >{'{'}{Object.keys(val).length} keys{'}'}
                                    {expandedAttrs[`${cluster}:${key}`] ? '▲' : '▼'}</span
                                  >
                                </div>
                                {#if expandedAttrs[`${cluster}:${key}`]}
                                  <div class="expanded-details">
                                    <ul>
                                      {#each Object.entries(val) as [k, v]}
                                        <li>
                                          <span class="detail-k">{k}:</span>
                                          <span class="detail-v">{v}</span>
                                        </li>
                                      {/each}
                                    </ul>
                                  </div>
                                {/if}
                              </div>
                            {:else}
                              <div class="attribute-item">
                                <span class="attr-key">{key}</span>
                                <span class="attr-val font-mono">{val}</span>
                              </div>
                            {/if}
                          {/each}
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {:else if mqttLoading}
              <div class="loading mt-4" role="status" aria-live="polite">
                {$t('entity_detail.mqtt.loading')}
              </div>
            {:else if mqttError}
              <div class="save-message error mt-4">{mqttError}</div>
            {:else}
              <div class="entity-detail-section mt-6">
                <!-- Premium MQTT Header Card -->
                <div class="entity-header-card">
                  <div class="entity-title-row">
                    <div class="device-type-badge">
                      <span class="device-icon">📡</span>
                      <span class="device-name">{entity.type}</span>
                    </div>
                    {#if mqttInfo && mqttInfo.payload}
                      {@const payloadObj = getPayloadObj(JSON.stringify(mqttInfo.payload))}
                      {@const isMqttOn =
                        payloadObj.state === 'on' ||
                        payloadObj.state === true ||
                        payloadObj.power === 'on'}
                      <div class="status-badge" class:on={isMqttOn}>
                        {isMqttOn ? 'On' : 'Off'}
                      </div>
                    {:else}
                      <div class="status-badge">Unknown</div>
                    {/if}
                  </div>
                  <div class="entity-info-row">
                    <div class="info-item">
                      <span class="info-label">Name</span>
                      <span class="info-value text-highlight">{entity.displayName}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">Entity ID</span>
                      <span class="info-value font-mono">{entity.id}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">Topic Prefix</span>
                      <span class="info-value font-mono"
                        >{bridgeInfo?.bridges?.find((b) => b.serial?.portId === entity.portId)
                          ?.mqttTopicPrefix || 'homenet'}</span
                      >
                    </div>
                  </div>
                </div>

                <!-- Discovery Info Card -->
                <div class="detail-section-title font-medium mt-4">
                  {$t('entity_detail.mqtt.discovery_info')}
                </div>
                {#if mqttInfo}
                  <div class="discovery-details-card">
                    <div class="discovery-detail-item">
                      <div class="discovery-detail-header">
                        <span class="detail-label">{$t('entity_detail.mqtt.topic')}</span>
                        <Button
                          variant="secondary"
                          onclick={() => {
                            if (mqttInfo) {
                              navigator.clipboard.writeText(mqttInfo.topic);
                            }
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                      <div class="topic-value-container">
                        <code class="topic-value">{mqttInfo.topic}</code>
                      </div>
                    </div>

                    <div class="discovery-detail-item">
                      <div class="discovery-detail-header">
                        <span class="detail-label">{$t('entity_detail.mqtt.payload')}</span>
                        <Button
                          variant="secondary"
                          onclick={() => {
                            if (mqttInfo) {
                              navigator.clipboard.writeText(
                                JSON.stringify(mqttInfo.payload, null, 2),
                              );
                            }
                          }}
                        >
                          Copy JSON
                        </Button>
                      </div>
                      <div class="payload-code-container">
                        <pre><code>{JSON.stringify(mqttInfo.payload, null, 2)}</code></pre>
                      </div>
                    </div>
                  </div>
                {:else}
                  <p class="preview-empty">
                    {$t('entity_detail.mqtt.empty')}
                  </p>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {:else if activeTab === 'config'}
        <div role="tabpanel" id="panel-config" aria-labelledby="tab-config" tabindex="0">
          <div class="section config-section">
            {#if configLoading}
              <div class="loading" role="status" aria-live="polite">
                {$t('entity_detail.config.loading')}
              </div>
            {:else}
              <div class="config-editor-container">
                <MonacoYamlEditor
                  class="config-editor"
                  value={editingConfig}
                  onChange={(nextValue) => (editingConfig = nextValue)}
                  readOnly={false}
                  placeholder="type: switch\nname: My Light\n..."
                  schemaUri={activeTab === 'config'
                    ? (() => {
                        if (isAutomation) return './api/schema/entity/automation';
                        if (isScript) return './api/schema/entity/script';
                        return `./api/schema/entity/${entity.type ?? 'unknown'}`;
                      })()
                    : undefined}
                  mode={editorMode}
                />
                <div class="config-actions">
                  <div class="actions-left">
                    {#if currentDocUrl && currentTypeLabel}
                      <a
                        href={currentDocUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="docs-link"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                          ></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        {currentTypeLabel} 문서 보기
                      </a>
                    {/if}
                  </div>
                  <div class="actions-right">
                    <Button
                      variant="success"
                      onclick={saveConfig}
                      isLoading={isSaving}
                      ariaLabel={isSaving
                        ? $t('entity_detail.config.saving')
                        : $t('entity_detail.config.save')}
                    >
                      {$t('entity_detail.config.save')}
                    </Button>
                    {#if saveMessage}
                      <span class="save-message success" role="status" aria-live="polite">
                        {saveMessage}
                      </span>
                    {/if}
                    {#if configError}
                      <span class="save-message error" role="alert" aria-live="assertive">
                        {configError}
                      </span>
                    {/if}
                  </div>
                </div>
                {#if isDeviceEntity && integrationType === 'mqtt'}
                  <div class="discovery-preview-section">
                    <div class="discovery-preview-header">
                      <h4>{$t('entity_detail.config.discovery_preview_title')}</h4>
                      <Button
                        variant="outline-primary"
                        onclick={previewDiscoveryPublish}
                        disabled={discoveryPreviewLoading}
                      >
                        {discoveryPreviewLoading
                          ? $t('entity_detail.config.discovery_preview_loading')
                          : $t('entity_detail.config.discovery_preview_button')}
                      </Button>
                    </div>

                    {#if discoveryPreviewError}
                      <p class="save-message error">{discoveryPreviewError}</p>
                    {:else if discoveryPreview}
                      <div class="discovery-preview-result">
                        <p class="preview-label">
                          {$t('entity_detail.config.discovery_preview_topic')}
                        </p>
                        <pre>{discoveryPreview.topic}</pre>
                        <p class="preview-label">
                          {$t('entity_detail.config.discovery_preview_payload')}
                        </p>
                        <pre>{JSON.stringify(discoveryPreview.payload, null, 2)}</pre>
                      </div>
                    {:else}
                      <p class="preview-empty">
                        {$t('entity_detail.config.discovery_preview_empty')}
                      </p>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {:else if activeTab === 'packets'}
        <div role="tabpanel" id="panel-packets" aria-labelledby="tab-packets" tabindex="0">
          <div class="section packet-log-section">
            <div class="log-header">
              <div class="header-left">
                <h4>{$t('entity_detail.packets.title')}</h4>
                <div class="filters">
                  <label>
                    <input type="checkbox" bind:checked={showRx} />
                    {$t('entity_detail.packets.rx_label')}
                  </label>
                  <label>
                    <input type="checkbox" bind:checked={showTx} />
                    {$t('entity_detail.packets.tx_label')}
                  </label>
                </div>
              </div>
            </div>
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div
              class="log-list unified-list"
              role="log"
              tabindex="0"
              aria-label={$t('entity_detail.packets.title')}
            >
              {#if mergedPackets.length === 0}
                <div class="no-data">{$t('entity_detail.packets.no_packets')}</div>
              {:else}
                {#each mergedPackets as packet, index (`${packet.type}-${packet.timestamp}-${index}`)}
                  <div class="log-entry {packet.type}">
                    <div class="log-meta">
                      <span class="time">
                        {packet.timeLabel ?? formatTime(packet.timestamp)}
                      </span>
                      <span class="direction {packet.type}">{packet.type.toUpperCase()}</span>
                    </div>

                    <div class="log-content">
                      <div class="log-row primary">
                        <span class="entity">{packet.entityId}</span>
                        <div class="code-wrapper">
                          <span class="payload">{packet.packet.toUpperCase()}</span>
                          <button
                            class="copy-btn"
                            onclick={() => copyPacket(packet.packet.toUpperCase())}
                            aria-label={copiedPacket === packet.packet.toUpperCase()
                              ? $t('common.copied')
                              : $t('common.copy')}
                            title={copiedPacket === packet.packet.toUpperCase()
                              ? $t('common.copied')
                              : $t('common.copy')}
                          >
                            {#if copiedPacket === packet.packet.toUpperCase()}
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                class="success-icon"
                                aria-hidden="true"
                              >
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            {:else}
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                              >
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                                ></path>
                              </svg>
                            {/if}
                          </button>
                        </div>
                      </div>
                      <div class="log-row secondary">
                        {#if packet.type === 'rx'}
                          {#if packet.state}
                            <span class="state-preview">→ {JSON.stringify(packet.state)}</span>
                          {/if}
                        {:else}
                          <span class="command-info">
                            {packet.command}
                            {#if packet.value !== undefined}<span class="value"
                                >({packet.value})</span
                              >{/if}
                          </span>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        </div>
      {:else if activeTab === 'logs'}
        <div role="tabpanel" id="panel-logs" aria-labelledby="tab-logs" tabindex="0">
          {#if hasErrors}
            <div class="section error-section">
              <h3>{$t('entity_detail.errors.title')}</h3>
              <div class="error-list" role="list">
                {#each groupedErrors as group (group.key)}
                  <div class="error-entry" role="listitem">
                    <div class="error-meta">
                      <span class="error-time">{formatTime(group.latestTimestamp)}</span>
                      {#if group.count > 1}
                        <span
                          class="error-count-badge"
                          title={$t('entity_detail.errors.count', {
                            values: { count: group.count },
                          }) || `${group.count} occurrences`}
                        >
                          {group.count}
                        </span>
                      {/if}
                      <span class="error-type"
                        >{$t(`entity_detail.errors.types.${group.error.type}`)}</span
                      >
                    </div>
                    <div class="error-message">{group.error.message}</div>
                    {#if formatErrorContext(group.error.context)}
                      <div class="error-context">{formatErrorContext(group.error.context)}</div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
          <div class="section">
            <ActivityLogList
              logs={activityLogs}
              title={logTitle}
              emptyMessage={logEmptyMessage}
              height="260px"
            />
          </div>
        </div>
      {:else if activeTab === 'manage'}
        <div role="tabpanel" id="panel-manage" aria-labelledby="tab-manage" tabindex="0">
          {#if isDeviceEntity}
            <div class="section manage-card">
              <h3>{$t('entity_detail.manage.rename.title')}</h3>
              <p class="subtle">{$t('entity_detail.manage.rename.desc')}</p>
              <div class="rename-form">
                <input
                  type="text"
                  bind:value={renameInput}
                  placeholder={$t('entity_detail.manage.rename.placeholder')}
                  aria-label={$t('entity_detail.manage.rename.placeholder')}
                  oninput={() => (renameLocalError = null)}
                />
                <Button
                  variant="success"
                  onclick={handleRename}
                  isLoading={isRenaming}
                  ariaLabel={isRenaming
                    ? $t('entity_detail.manage.rename.saving')
                    : $t('entity_detail.manage.rename.save')}
                >
                  {$t('entity_detail.manage.rename.save')}
                </Button>
              </div>
              <label class="checkbox-label">
                <input type="checkbox" bind:checked={updateEntityId} />
                {$t('entity_detail.manage.rename.update_id')}
              </label>
              {#if effectiveRenameError}
                <div class="rename-error">{effectiveRenameError}</div>
              {/if}
            </div>

            {#if entity.isActive}
              <div class="section manage-card">
                <h3>{$t('entity_detail.manage.revoke.title')}</h3>
                <p class="subtle">
                  {@html $t('entity_detail.manage.revoke.desc')}
                </p>
                <Button variant="secondary" onclick={handleRevokeDiscovery}>
                  {$t('entity_detail.manage.revoke.button')}
                </Button>
              </div>
            {/if}

            {#if !entity.isActive || entity.discoveryAlways}
              <div class="section manage-card">
                <div class="toggle-row">
                  <div class="toggle-info">
                    <h3 id="force-active-title">
                      {$t('entity_detail.manage.force_active.title')}
                    </h3>
                    <p class="subtle">{$t('entity_detail.manage.force_active.desc')}</p>
                  </div>
                  <Toggle
                    checked={entity.discoveryAlways ?? false}
                    onchange={handleToggleDiscoveryAlways}
                    disabled={isTogglingDiscoveryAlways}
                    ariaLabelledBy="force-active-title"
                  />
                </div>
                {#if forceActiveError}
                  <div class="rename-error">{forceActiveError}</div>
                {/if}
              </div>
            {/if}
            <div class="section manage-card danger-zone">
              <h3>{$t('entity_detail.manage.delete.title')}</h3>
              <p class="subtle">
                {@html $t('entity_detail.manage.delete.desc')}
              </p>
              <Button variant="danger" onclick={handleDeleteEntity}>
                {$t('entity_detail.manage.delete.button')}
              </Button>
            </div>
          {:else if isAutomation}
            <div class="section manage-card">
              <div class="toggle-row">
                <div class="toggle-info">
                  <h3 id="automation-toggle-title">
                    {$t('entity_detail.automation.toggle_title')}
                  </h3>
                  <p class="subtle">{$t('entity_detail.automation.toggle_desc')}</p>
                </div>
                <Toggle
                  checked={entity.enabled ?? true}
                  onchange={handleToggleAutomationEnabled}
                  disabled={isTogglingAutomation}
                  ariaLabelledBy="automation-toggle-title"
                />
              </div>
              {#if automationToggleError}
                <div class="rename-error">{automationToggleError}</div>
              {/if}
            </div>
            <div class="section manage-card danger-zone">
              <h3>{$t('entity_detail.automation.delete_title')}</h3>
              <p class="subtle">{$t('entity_detail.automation.delete_desc')}</p>
              <Button variant="danger" onclick={handleDeleteAutomation}>
                {$t('entity_detail.automation.delete_button')}
              </Button>
            </div>
          {:else if isScript}
            <div class="section manage-card danger-zone">
              <h3>{$t('entity_detail.script.delete_title')}</h3>
              <p class="subtle">{$t('entity_detail.script.delete_desc')}</p>
              <Button variant="danger" onclick={handleDeleteScript}>
                {$t('entity_detail.script.delete_button')}
              </Button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</Modal>

<Dialog
  open={dialog.open}
  title={dialog.title}
  message={dialog.message}
  confirmText={dialog.confirmText}
  variant={dialog.variant}
  loading={dialog.loading}
  loadingText={dialog.loadingText}
  showCancel={dialog.showCancel}
  onconfirm={dialog.onConfirm}
  oncancel={closeDialog}
/>

<style>
  .details-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .detail-section-title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    border-left: 3px solid #3b82f6;
    padding-left: 0.5rem;
    color: #f8fafc;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    background-color: #334155;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
  }

  .summary-label {
    font-size: 0.8rem;
    color: #94a3b8;
    margin-bottom: 0.25rem;
  }

  .summary-value {
    font-size: 0.9rem;
    font-weight: 500;
    color: #f1f5f9;
  }

  .modal-content-wrapper {
    background: #1e293b;
    display: flex;
    flex-direction: column;
    height: 85dvh;
    max-height: 730px;
    overflow: hidden;
  }

  .modal-header {
    padding: 1.5rem;
    border-bottom: 1px solid #334155;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    background: #0f172a;
  }

  .header-info h2 {
    margin: 0;
    color: #f1f5f9;
    font-size: 1.5rem;
  }

  .entity-id {
    color: #94a3b8;
    font-family: monospace;
    font-size: 0.9rem;
    display: inline-block;
  }

  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 2rem;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    transition: color 0.2s;
  }

  .close-btn:hover {
    color: #fff;
  }

  .modal-tabs {
    display: flex;
    background: #0f172a;
    padding: 0 1.5rem;
    border-bottom: 1px solid #334155;
    gap: 1rem;
  }

  .modal-tabs button {
    background: none;
    border: none;
    padding: 1rem 0.5rem;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 500;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
  }

  .modal-tabs button:hover {
    color: #e2e8f0;
  }

  .modal-tabs button.active {
    color: #38bdf8;
    border-bottom-color: #38bdf8;
  }

  .modal-body {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
  }

  .section {
    margin-bottom: 2rem;
  }

  h3 {
    margin: 0 0 1rem 0;
    color: #e2e8f0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .subtle {
    margin: 0.5rem 0;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .description-text {
    margin: 0 0 1rem 0;
    color: #cbd5e1;
    font-size: 0.95rem;
    line-height: 1.6;
    background: rgba(15, 23, 42, 0.3);
    padding: 0.75rem 1rem;
  }

  .activity-text {
    margin: 0 0 1.5rem 0;
    color: #93c5fd;
    font-size: 0.9rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .activity-text .icon {
    font-size: 1rem;
  }

  .rename-form {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .rename-form input {
    flex: 1;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    border: 1px solid #334155;
    background: #0b1220;
    color: #e2e8f0;
    font-size: 1rem;
  }

  .rename-form input:focus {
    outline: none;
    border-color: #38bdf8;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
  }

  .rename-error {
    margin-top: 0.5rem;
    color: #f87171;
    font-size: 0.9rem;
  }

  .payload-list {
    background: #0f172a;
    border-radius: 8px;
    border: 1px solid #334155;
    overflow: hidden;
  }

  .payload-item {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #334155;
  }

  .payload-item:last-child {
    border-bottom: none;
  }

  .payload-key {
    color: #94a3b8;
  }

  .payload-value {
    color: #fff;
    font-weight: 500;
  }

  .command-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .script-args {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .arg-desc {
    color: #94a3b8;
    font-size: 0.8rem;
    font-weight: normal;
    margin-left: 0.5rem;
  }

  .input-group {
    display: flex;
    height: 60px; /* Match standard button height */
    box-sizing: border-box;
    gap: 0.5rem;
    background: #334155;
    padding: 0.75rem;
    border-radius: 6px;
    border: 1px solid #475569;
    align-items: center;
    color: #fff;
  }

  .input-group label {
    font-size: 0.9rem;
    color: #fff;
    flex: 1;
    font-weight: 500;
  }

  .input-group input {
    background: #1e293b;
    border: 1px solid #475569;
    color: #fff;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    width: 60px;
    font-size: 0.9rem;
  }

  .input-group select {
    background: #1e293b;
    border: 1px solid #475569;
    color: #fff;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    min-width: 140px;
    font-size: 0.9rem;
  }

  .input-group input:focus {
    outline: none;
    border-color: #38bdf8;
  }

  .input-group select:focus {
    outline: none;
    border-color: #38bdf8;
  }

  /* Button overrides for specific layout needs in input group */
  :global(.input-group .btn) {
    padding: 0.25rem 0.75rem;
    font-size: 0.85rem;
    height: auto;
  }

  :global(.cmd-btn) {
    height: 60px; /* Ensure full height for grid items */
  }

  .config-editor-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.75rem;
  }

  .config-header-actions {
    display: flex;
    justify-content: flex-end;
  }

  .config-editor {
    flex: 1;
    min-height: 0;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 4px;
    overflow: hidden;
  }

  .docs-link {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.8rem;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 6px;
    color: #cbd5e1;
    font-size: 0.85rem;
    font-weight: 500;
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .docs-link:hover {
    background: rgba(30, 41, 59, 0.8);
    border-color: rgba(148, 163, 184, 0.5);
    color: #f1f5f9;
  }

  .config-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.5rem;
  }

  .actions-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  :global(.config-editor) {
    position: relative;
    flex: 1;
    background: #0f172a;
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid #334155;
    color: #e2e8f0;
    font-family: 'Fira Code', monospace;
    font-size: 0.9rem;
    line-height: 1.5;
    min-height: 400px;
    outline: none;
  }

  :global(.config-editor:focus-within) {
    border-color: #38bdf8;
  }

  .config-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .save-message {
    font-size: 0.9rem;
  }

  .save-message.success {
    color: #34d399;
  }

  .save-message.error {
    color: #f87171;
  }

  .discovery-preview-section {
    margin-top: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.45);
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .discovery-preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .discovery-preview-header h4 {
    margin: 0;
    font-size: 0.95rem;
    color: #e2e8f0;
  }

  .discovery-preview-result pre {
    margin: 0.35rem 0 0.75rem;
    padding: 0.65rem;
    border-radius: 6px;
    background: rgba(2, 6, 23, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #cbd5e1;
    font-size: 0.82rem;
    max-height: 220px;
    overflow: auto;
  }

  .preview-label {
    margin: 0;
    color: #94a3b8;
    font-size: 0.8rem;
    text-transform: uppercase;
  }

  .preview-empty {
    margin: 0;
    color: #94a3b8;
    font-size: 0.85rem;
  }

  /* Unified Log Styles */
  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .filters {
    display: flex;
    gap: 1rem;
    font-size: 0.9rem;
    color: #94a3b8;
  }

  .filters label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
  }

  .filters input {
    cursor: pointer;
  }

  .log-list {
    flex: 1;
    overflow-y: auto;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 0.5rem;
    max-height: 500px; /* Limit height */
  }

  .log-entry {
    padding: 0.25rem 0.6rem;
    border-bottom: 1px solid #1e293b;
    font-size: 0.85rem;
    font-family: monospace;
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    color: #cbd5e1;
    min-height: 52px;
  }

  .log-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
    padding-top: 0.1rem;
  }

  .log-content {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .log-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 24px;
  }

  .log-entry:last-child {
    border-bottom: none;
  }

  .log-entry .time {
    color: #64748b;
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .direction {
    font-weight: bold;
    font-size: 0.75rem;
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
    width: 24px;
    text-align: center;
  }

  .direction.rx {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
  }

  .direction.tx {
    background: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
  }

  .payload {
    color: #10b981;
    font-weight: 600;
    font-family: monospace;
  }

  .code-wrapper {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .copy-btn {
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

  .copy-btn:hover {
    color: #e2e8f0;
    background: rgba(148, 163, 184, 0.1);
  }

  .success-icon {
    color: #34d399;
  }

  .command-info {
    color: #a855f7;
    margin-left: 0.5rem;
  }

  .value {
    color: #ec4899;
  }

  .state-preview {
    color: #38bdf8;
    font-size: 0.85em;
    opacity: 0.9;
  }

  .no-data {
    padding: 2rem;
    text-align: center;
    color: #475569;
    font-style: italic;
  }

  .error-section {
    margin-bottom: 1.5rem;
  }

  .error-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 220px;
    overflow-y: auto;
    padding-right: 0.25rem;
  }

  .error-entry {
    border: 1px solid rgba(248, 113, 113, 0.4);
    background: rgba(239, 68, 68, 0.08);
    border-radius: 10px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .error-meta {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    font-size: 0.85rem;
    color: rgba(248, 113, 113, 0.9);
  }

  .error-type {
    background: rgba(248, 113, 113, 0.15);
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .error-message {
    font-size: 0.95rem;
    color: #fecaca;
    word-break: break-word;
  }

  .error-context {
    font-size: 0.8rem;
    color: rgba(226, 232, 240, 0.75);
    background: rgba(15, 23, 42, 0.6);
    padding: 0.35rem 0.5rem;
    border-radius: 8px;
    word-break: break-word;
  }

  .error-count-badge {
    background: #f59e0b;
    color: #fff;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0 0.4rem;
    border-radius: 9999px;
    margin-right: 0.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 1.25rem;
    min-width: 1.25rem;
  }

  /* Manage Tab Styles */
  .manage-card {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 1.5rem;
  }

  .manage-card h3 {
    margin-bottom: 0.5rem;
  }

  .manage-card .subtle {
    margin-bottom: 1rem;
  }

  .manage-card .rename-form {
    margin-top: 1rem;
  }

  .danger-zone {
    border-color: rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.05);
  }

  .danger-zone h3 {
    color: #f87171;
  }

  .toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .toggle-info {
    flex: 1;
  }

  .toggle-info h3 {
    margin-bottom: 0.25rem;
  }

  .toggle-info .subtle {
    margin-bottom: 0;
  }

  @media (max-width: 768px) {
    .modal-content-wrapper {
      border-radius: 0;
      height: 100dvh;
      min-height: 710px;
    }

    .modal-header {
      padding: 1rem;
    }

    .modal-tabs {
      padding: 0 1rem;
    }

    .modal-body {
      padding: 0.5rem;
    }

    .manage-card {
      padding: 1rem;
    }
  }

  /* Unified Details Styling */
  .entity-detail-section {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    color: #e2e8f0;
  }

  .entity-header-card {
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.7) 100%);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  }

  .entity-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
    padding-bottom: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .device-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    border-radius: 8px;
    background: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.25);
  }

  .device-icon {
    font-size: 1.1rem;
  }

  .device-name {
    font-weight: 700;
    font-size: 1.1rem;
    color: #38bdf8;
  }

  .device-code {
    color: #94a3b8;
    font-family: monospace;
    font-size: 0.9rem;
  }

  .status-badge {
    background: #475569;
    color: #cbd5e1;
    font-size: 0.8rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-badge.on {
    background: linear-gradient(90deg, #10b981 0%, #059669 100%);
    color: #fff;
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
  }

  .entity-info-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
  }

  .info-value {
    font-size: 0.9rem;
    font-weight: 600;
    color: #f1f5f9;
  }

  .info-value.text-highlight {
    color: #f59e0b;
  }

  .clusters-header {
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
    padding-bottom: 0.5rem;
    margin-top: 0.5rem;
  }

  .clusters-header h3 {
    font-size: 1.05rem;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
  }

  .clusters-list-horizontal {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .cluster-pill {
    background: rgba(148, 163, 184, 0.1);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #cbd5e1;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
  }

  .matter-status-card {
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
  }

  .matter-status-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
  }

  .matter-label {
    color: #94a3b8;
  }

  .matter-value {
    font-weight: 600;
    color: #cbd5e1;
  }

  .matter-value.on {
    color: #10b981;
  }

  .clusters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
  }

  .cluster-card {
    background: rgba(30, 41, 59, 0.3);
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 8px;
    overflow: hidden;
  }

  .cluster-card-header {
    background: rgba(30, 41, 59, 0.7);
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
    font-size: 0.9rem;
    color: #f1f5f9;
  }

  .cluster-card-body {
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .attribute-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    padding: 0.15rem 0;
  }

  .attribute-item.highlight {
    background: rgba(56, 189, 248, 0.08);
    padding: 0.25rem 0.4rem;
    border-radius: 4px;
    margin: 0.1rem 0;
  }

  .attr-key {
    color: #94a3b8;
  }

  .attr-val {
    color: #cbd5e1;
  }

  .attr-val.on {
    color: #10b981;
    font-weight: bold;
  }

  .attr-val.text-bold {
    font-weight: 700;
  }

  .attr-val.text-success {
    color: #10b981;
  }

  /* MQTT specific styles unified to match Matter card */

  /* Discovery Details Card (Code Sandbox Style) */
  .discovery-details-card {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 8px;
    padding: 1rem;
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  .discovery-detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .detail-label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    font-weight: 700;
  }

  .topic-value-container {
    background: #1e293b;
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    border-left: 3px solid #0d9488;
    overflow-x: auto;
  }

  .topic-value {
    font-family: monospace;
    font-size: 0.85rem;
    color: #e2e8f0;
    white-space: nowrap;
  }

  .payload-code-container {
    background: #1e293b;
    border-radius: 4px;
    padding: 0.75rem;
    overflow-x: auto;
    max-height: 350px;
    border-left: 3px solid #3b82f6;
  }

  .payload-code-container pre {
    margin: 0;
  }

  .payload-code-container code {
    font-family: monospace;
    font-size: 0.85rem;
    color: #60a5fa;
  }

  /* Collapsible Attribute Details for Matter Clusters */
  .attribute-item.flex-col {
    flex-direction: column;
    align-items: stretch;
    cursor: pointer;
  }

  .attribute-row-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .hover-highlight:hover {
    color: #38bdf8;
  }

  .expanded-details {
    margin-top: 0.35rem;
    padding: 0.5rem 0.75rem;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 6px;
    width: 100%;
  }

  .expanded-details ul {
    margin: 0;
    padding: 0;
    list-style: none;
    font-family: monospace;
    font-size: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .expanded-details li {
    color: #cbd5e1;
    word-break: break-all;
    text-align: left;
  }

  .expanded-details .detail-k {
    color: #94a3b8;
  }

  .expanded-details .detail-v {
    color: #38bdf8;
    font-weight: 500;
  }

  .expanded-details .empty-text {
    font-size: 0.75rem;
    font-style: italic;
    color: #64748b;
  }
</style>
