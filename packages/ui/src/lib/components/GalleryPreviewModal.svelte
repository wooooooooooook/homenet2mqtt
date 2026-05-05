<script lang="ts">
  import { t, locale } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import Giscus from './Giscus.svelte';
  import Button from './Button.svelte';
  import MonacoDiffEditor from './MonacoDiffEditor.svelte';
  import Modal from './Modal.svelte';
  import HintBubble from './HintBubble.svelte';
  import Dialog from './Dialog.svelte';
  import yaml from 'js-yaml';
  import ParameterObjectArrayEditor from './ParameterObjectArrayEditor.svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { triggerSystemRestart as restartApp } from '../utils/appControl';
  import type {
    GalleryDiscoveryResult,
    GalleryItemForPreview,
    GalleryMatch,
    GalleryParameterDefinition,
    GallerySchemaField,
    GalleryVendorRequirements,
  } from '../types';

  interface CompatibilityResult {
    compatible: boolean;
    mismatches: { field: string; expected: unknown; actual: unknown }[];
  }

  interface Conflict {
    type: 'entity' | 'automation' | 'script';
    entityType?: string;
    id: string;
    existingYaml: string;
    newYaml: string;
  }

  interface NewItem {
    type: 'entity' | 'automation' | 'script';
    entityType?: string;
    id: string;
  }

  type MatchAction = 'overwrite' | 'add' | 'skip';

  const GALLERY_FILE_API = './api/gallery/file';

  let {
    item,
    portId,
    vendorRequirements,
    discoveryResult,
    onClose,
  }: {
    item: GalleryItemForPreview;
    portId: string | null;
    vendorRequirements?: GalleryVendorRequirements;
    discoveryResult?: GalleryDiscoveryResult;
    onClose: () => void;
  } = $props();

  const isDiscovered = $derived(discoveryResult?.matched ?? false);

  let yamlContent = $state('');
  let loadingYaml = $state(true);
  let yamlError = $state<string | null>(null);

  let applying = $state(false);
  let applyError = $state<string | null>(null);
  let applySuccess = $state(false);
  let restarting = $state(false);
  let parameterError = $state<string | null>(null);
  let parameterInputs = $state<Record<string, string>>({});

  // Conflict detection states
  let checkingConflicts = $state(false);
  let conflicts = $state<Conflict[]>([]);
  let matches = $state<GalleryMatch[]>([]);
  let newItems = $state<NewItem[]>([]);
  let showConflictModal = $state(false);
  let resolutions = $state<Record<string, 'overwrite' | 'skip' | 'rename'>>({});
  let renames = $state<Record<string, string>>({});
  let matchActions = $state<Record<string, MatchAction>>({});
  let matchTargets = $state<Record<string, string>>({}); // galleryId -> selected matchedId
  let expandedDiffs = $state<Set<string>>(new Set());
  let openDropdownMatchId = $state<string | null>(null);
  let showYaml = $state(false);
  let showPortHint = $state(false);

  // HA Ingress 환경 감지 (URL 경로에 hassio_ingress 포함 여부)
  const isIngress = $derived.by(() => {
    if (typeof window === 'undefined') return false;
    return window.location.pathname.includes('hassio_ingress');
  });

  // ===== GitHub Discussion 우회 (HA ingress 환경용) =====
  const STATS_WORKER_URL = 'https://h2m-gallery-stats.nubiz.workers.dev';

  let discussionLoading = $state(false);
  let discussionError = $state<string | null>(null);

  let showAnonymousComment = $state(false);
  let anonymousName = $state('');
  let anonymousMessage = $state('');
  let commentSubmitting = $state(false);
  let commentSuccess = $state(false);
  let commentError = $state<string | null>(null);
  // Giscus 재마운트 트리거 (익명 댓글 제출 성공 시 증가)
  let giscusKey = $state(0);

  async function openDiscussion() {
    discussionLoading = true;
    discussionError = null;
    try {
      const res = await fetch(
        `${STATS_WORKER_URL}/discussion?term=${encodeURIComponent(item.file)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      discussionError = e?.message ?? 'Unknown error';
    } finally {
      discussionLoading = false;
    }
  }

  async function submitAnonymousComment() {
    if (!anonymousMessage.trim()) return;
    commentSubmitting = true;
    commentSuccess = false;
    commentError = null;
    try {
      // 1단계: 토큰 발급 (로컬 서비스에서 발급 — 외부에서 위조 불가)
      const tokenRes = await fetch('./api/gallery/discussion-token');
      if (!tokenRes.ok) throw new Error(`Token error: HTTP ${tokenRes.status}`);
      const { token } = await tokenRes.json();

      // 2단계: 댓글 작성
      const commentRes = await fetch(`${STATS_WORKER_URL}/discussion/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: item.file,
          name: anonymousName.trim() || '익명',
          message: anonymousMessage.trim(),
          token,
        }),
      });
      if (!commentRes.ok) {
        const text = await commentRes.text();
        throw new Error(text || `HTTP ${commentRes.status}`);
      }
      commentSuccess = true;
      giscusKey += 1; // Giscus iframe 재마운트
      anonymousMessage = '';
      anonymousName = '';
    } catch (e: any) {
      commentError = e?.message ?? 'Unknown error';
    } finally {
      commentSubmitting = false;
    }
  }

  function toggleDropdown(matchId: string, event: MouseEvent) {
    event.stopPropagation();
    if (openDropdownMatchId === matchId) {
      openDropdownMatchId = null;
    } else {
      openDropdownMatchId = matchId;
    }
  }

  function handleWindowClick() {
    openDropdownMatchId = null;
  }

  function selectOption(matchId: string, candidateMatchId: string) {
    matchTargets[matchId] = candidateMatchId;
    matchActions[matchId] = 'overwrite';
    openDropdownMatchId = null;
  }

  // Detect duplicate match target selections
  const duplicateTargets = $derived.by(() => {
    const targetCounts = new Map<string, string[]>();
    for (const [galleryId, action] of Object.entries(matchActions)) {
      if (action !== 'overwrite') continue;
      const targetId = matchTargets[galleryId];
      if (!targetId) continue;
      if (!targetCounts.has(targetId)) {
        targetCounts.set(targetId, []);
      }
      targetCounts.get(targetId)!.push(galleryId);
    }
    // Return map of targetId -> array of galleryIds that selected it (only duplicates)
    const duplicates = new Map<string, string[]>();
    for (const [targetId, galleryIds] of targetCounts) {
      if (galleryIds.length > 1) {
        duplicates.set(targetId, galleryIds);
      }
    }
    return duplicates;
  });

  // Compatibility check states
  let compatibility = $state<CompatibilityResult | null>(null);
  let forceApply = $state(false);

  const displayName = $derived(
    $locale?.startsWith('en') && item.name_en ? item.name_en : item.name,
  );

  let snippetDescription = $state('');
  let snippetDescriptionEn = $state('');

  const displayDescription = $derived(
    $locale?.startsWith('en') && (snippetDescriptionEn || item.description_en)
      ? snippetDescriptionEn || item.description_en
      : snippetDescription || item.description,
  );

  const htmlDescription = $derived.by(() => {
    if (!displayDescription) return '';
    const rawHtml = marked.parse(displayDescription, { async: false }) as string;
    if (typeof window !== 'undefined') {
      return DOMPurify.sanitize(rawHtml);
    }
    return rawHtml;
  });

  const scriptCount = $derived(item.content_summary.scripts ?? 0);
  const hasParameters = $derived((item.parameters?.length ?? 0) > 0);

  function formatItemLabel(itemType: 'entity' | 'automation' | 'script', entityType?: string) {
    if (itemType === 'entity') {
      return `[${entityType}]`;
    }
    if (itemType === 'automation') {
      return '[automation]';
    }
    return '[script]';
  }

  function resolveErrorMessage(error: any) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    const errorCode = (error as any)?.error;

    if (errorCode === 'Incompatible version' || message === 'Incompatible version') {
      const minVersion = (error as any).minVersion || '?';
      const appVersion = (error as any).appVersion || '?';
      return $t('gallery.incompatible_version', {
        values: { minVersion, appVersion },
      });
    }
    return message;
  }

  function processYamlForDiff(
    content: string,
    fieldsToRemove: string[],
    overrides: Record<string, string> = {},
  ) {
    if (!content) return '';

    // Use regex-based line processing to preserve comments, hex values, and array formats
    const lines = content.split('\n');
    const resultLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match top-level keys (start of line, allowing spaces, match key followed by colon)
      // Note: We assume top-level keys have no indentation or consistent indentation.
      // For simple single-level diffs, this regex handles keys at start of line.
      const keyMatch = line.match(/^\s*([a-zA-Z0-9_]+):/);

      if (keyMatch) {
        const key = keyMatch[1];

        if (fieldsToRemove.includes(key)) {
          continue;
        }

        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          const rawValue = overrides[key];
          // Use raw value directly to preserve quoting style from existing content
          resultLines.push(`${key}: ${rawValue}`);
          continue;
        }
      }

      resultLines.push(line);
    }

    return resultLines.join('\n');
  }

  function getOriginalDiffContent(action: string, content: string) {
    if (action === 'add') return '';
    if (action === 'overwrite') {
      return processYamlForDiff(content, ['type', 'unique_id']);
    }
    return content;
  }

  function getRawValueFromContent(content: string, key: string): string | undefined {
    // Regex to find "key: value" and capture the value part.
    // Handles potential leading spaces.
    const regex = new RegExp(`^\\s*${key}:\\s*(.*)$`, 'm');
    const match = content.match(regex);
    return match ? match[1] : undefined;
  }

  function getModifiedDiffContent(
    action: string,
    newContent: string,
    existingContent: string,
    matchId: string,
  ) {
    if (action === 'overwrite') {
      const overrides: Record<string, string> = {};

      const existingId = getRawValueFromContent(existingContent, 'id');
      if (existingId !== undefined) {
        overrides['id'] = existingId;
      }

      const existingName = getRawValueFromContent(existingContent, 'name');
      if (existingName !== undefined) {
        overrides['name'] = existingName;
      }

      // Also remove type/unique_id to match original side filtering
      return processYamlForDiff(newContent, ['type', 'unique_id'], overrides);
    } else if (action === 'add') {
      // If adding with a new ID (rename), reflect it in the diff
      const newId = renames[matchId];
      if (newId && newId !== matchId) {
        // Use raw string for ID, assuming simple string without quotes needed for display
        return processYamlForDiff(newContent, [], { id: newId });
      }
    }
    return newContent;
  }

  function checkDuplicateId(match: GalleryMatch, id: string): boolean {
    if (!id || !match.candidates) return false;
    // Check if the input ID exists in the candidate list (which contains all entities of the same type)
    return match.candidates.some((c) => c.matchId === id);
  }

  async function loadYamlContent() {
    loadingYaml = true;
    yamlError = null;
    try {
      const url = `${GALLERY_FILE_API}?path=${encodeURIComponent(item.file)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch YAML');
      yamlContent = await response.text();

      try {
        const parsed: any = yaml.load(yamlContent);
        if (parsed && typeof parsed === 'object' && parsed.meta) {
          snippetDescription = parsed.meta.description || '';
          snippetDescriptionEn = parsed.meta.description_en || '';
        }
      } catch (e) {
        console.warn('Failed to parse YAML meta for description', e);
      }
    } catch (e) {
      yamlError = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      loadingYaml = false;
    }
  }

  onMount(() => {
    loadYamlContent();
    initializeParameterInputs();
  });

  function initializeParameterInputs() {
    const inputs: Record<string, string> = {};
    if (!item.parameters) {
      parameterInputs = inputs;
      return;
    }

    for (const parameter of item.parameters) {
      // Check if discovery result has a value for this parameter
      const discoveredValue = discoveryResult?.parameterValues?.[parameter.name];
      if (discoveredValue !== undefined && typeof discoveredValue === 'number') {
        inputs[parameter.name] = String(discoveredValue);
        continue;
      }

      // Fall back to default value
      if (parameter.default !== undefined) {
        if (typeof parameter.default === 'string') {
          inputs[parameter.name] = parameter.default;
        } else {
          inputs[parameter.name] = JSON.stringify(parameter.default);
        }
      } else {
        inputs[parameter.name] = '';
      }
    }

    parameterInputs = inputs;
  }

  function resolveParameterLabel(parameter: GalleryParameterDefinition) {
    if ($locale?.startsWith('en')) {
      return parameter.label_en || parameter.label || parameter.name;
    }
    return parameter.label || parameter.name;
  }

  function resolveParameterDescription(parameter: GalleryParameterDefinition) {
    if ($locale?.startsWith('en')) {
      return parameter.description_en || parameter.description || '';
    }
    return parameter.description || '';
  }

  function resolveSchemaFieldLabel(field: GallerySchemaField, fieldName: string): string {
    if ($locale?.startsWith('en')) {
      return field.label_en || field.label || fieldName;
    }
    return field.label || fieldName;
  }

  function formatSchemaFieldType(field: GallerySchemaField): string {
    const typeName =
      field.type === 'integer'
        ? $t('gallery.preview.parameters.type_integer')
        : field.type === 'string'
          ? $t('gallery.preview.parameters.type_string')
          : field.type === 'boolean'
            ? $t('gallery.preview.parameters.type_boolean')
            : field.type;
    return typeName;
  }

  function formatSchemaFieldConstraints(field: GallerySchemaField): string {
    const constraints: string[] = [];
    if (field.min !== undefined) {
      constraints.push(`${$t('gallery.preview.parameters.min')}: ${field.min}`);
    }
    if (field.max !== undefined) {
      constraints.push(`${$t('gallery.preview.parameters.max')}: ${field.max}`);
    }
    return constraints.join(', ');
  }

  function updateParameterInput(name: string, value: string) {
    parameterInputs = { ...parameterInputs, [name]: value };
  }

  function buildParameterValues() {
    parameterError = null;

    if (!item.parameters || item.parameters.length === 0) {
      return undefined;
    }

    const values: Record<string, unknown> = {};

    for (const parameter of item.parameters) {
      const rawValue = parameterInputs[parameter.name]?.trim() ?? '';

      if (parameter.type === 'integer') {
        if (rawValue === '') {
          throw new Error($t('gallery.preview.parameters.validation_required'));
        }
        const parsed = Number.parseInt(rawValue, 10);
        if (!Number.isInteger(parsed)) {
          throw new Error($t('gallery.preview.parameters.validation_integer'));
        }
        values[parameter.name] = parsed;
        continue;
      }

      if (parameter.type === 'string') {
        if (rawValue === '') {
          throw new Error($t('gallery.preview.parameters.validation_required'));
        }
        values[parameter.name] = rawValue;
        continue;
      }

      if (rawValue === '') {
        throw new Error($t('gallery.preview.parameters.validation_required'));
      }

      try {
        const parsed = JSON.parse(rawValue);
        if (parameter.type === 'integer[]' && !Array.isArray(parsed)) {
          throw new Error($t('gallery.preview.parameters.validation_array'));
        }
        if (parameter.type === 'object[]') {
          if (!Array.isArray(parsed)) {
            throw new Error($t('gallery.preview.parameters.validation_array'));
          }
          const invalidItem = parsed.find((item) => !item || typeof item !== 'object');
          if (invalidItem) {
            throw new Error($t('gallery.preview.parameters.validation_object_array'));
          }
        }
        values[parameter.name] = parsed;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : $t('gallery.preview.parameters.validation_json');
        throw new Error(message);
      }
    }

    return values;
  }

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
  });

  const closeDialog = () => {
    dialog.open = false;
  };

  const showConfirmDialog = ({
    title,
    message,
    confirmText,
    variant = 'primary',
    loadingText,
    action,
    onSuccess,
  }: {
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'primary' | 'danger' | 'success';
    loadingText?: string;
    action: () => Promise<void>;
    onSuccess?: () => void;
  }) => {
    dialog.title = title;
    dialog.message = message;
    dialog.confirmText = confirmText;
    dialog.variant = variant;
    dialog.loadingText = loadingText;
    dialog.showCancel = true;
    dialog.loading = false;
    dialog.onConfirm = async () => {
      dialog.loading = true;
      try {
        await action();
        if (onSuccess) {
          await onSuccess();
        } else {
          closeDialog();
        }
      } catch (err: any) {
        closeDialog();
        console.error(err);
      } finally {
        if (!onSuccess) dialog.loading = false;
      }
    };
    dialog.open = true;
  };

  async function triggerSystemRestart() {
    restarting = true;
    dialog.title = $t('settings.app_control.restart');
    dialog.message = $t('settings.app_control.restarting');
    dialog.loadingText = $t('settings.app_control.restarting');
    dialog.variant = 'primary';
    dialog.showCancel = false;
    dialog.loading = true;
    dialog.open = true;
    await restartApp();
  }

  async function handleRestart() {
    showConfirmDialog({
      title: $t('settings.app_control.restart'),
      message: $t('settings.app_control.restart_confirm'),
      confirmText: $t('settings.app_control.restart'),
      variant: 'danger',
      loadingText: $t('settings.app_control.restarting'),
      action: async () => triggerSystemRestart(),
      onSuccess: () => {
        // triggerSystemRestart handled the feedback
      },
    });
  }

  async function confirmAndCheckConflicts() {
    checkingConflicts = true;
    applyError = null;
    parameterError = null;

    try {
      const parameterValues = buildParameterValues();
      const response = await fetch('./api/gallery/check-conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portId,
          yamlContent,
          vendorRequirements,
          parameterValues,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        // Throw object to preserve extra fields (minVersion, appVersion)
        const error = new Error(data.error || 'Failed to check conflicts');
        Object.assign(error, data);
        throw error;
      }

      const data = await response.json();
      conflicts = data.conflicts || [];
      matches = data.matches || [];
      newItems = data.newItems || [];
      compatibility = data.compatibility || null;
      resolutions = {};
      renames = {};

      // Initialize matchActions and matchTargets with duplicate-avoidance logic
      function initializeMatchTargets() {
        const usedTargets = new Set<string>();
        const actions: Record<string, MatchAction> = {};
        const targets: Record<string, string> = {};

        for (const match of matches) {
          let selectedTarget = match.matchedId;

          const hasMatchedTarget = Boolean(match.matchedId);
          const canRecommendOverwrite = hasMatchedTarget && !usedTargets.has(match.matchedId);

          // If no matchedId (New Item), default to first candidate if available
          if (!selectedTarget && match.candidates && match.candidates.length > 0) {
            // Find first unused candidate if possible
            for (const candidate of match.candidates) {
              if (!usedTargets.has(candidate.matchId)) {
                selectedTarget = candidate.matchId;
                break;
              }
            }
            // Fallback to first candidate if all used
            if (!selectedTarget) {
              selectedTarget = match.candidates[0].matchId;
            }
          }

          // Default action:
          // - 'overwrite' only when matched target is not already recommended to another snippet
          // - otherwise 'add' to avoid duplicate overwrite recommendations
          actions[match.id] = canRecommendOverwrite ? 'overwrite' : 'add';
          targets[match.id] = selectedTarget;

          // Mark target as used if we are overwriting by default
          if (actions[match.id] === 'overwrite' && selectedTarget) {
            usedTargets.add(selectedTarget);
          }
        }

        return { actions, targets };
      }

      const { actions: defaultActions, targets: defaultTargets } = initializeMatchTargets();

      // Clear and update reactive objects to maintain proxy reactivity (Svelte 5)
      // Reassigning with a plain object would lose deep reactivity for subsequent mutations.
      for (const key in matchActions) delete matchActions[key];
      for (const key in matchTargets) delete matchTargets[key];

      Object.assign(matchActions, defaultActions);
      Object.assign(matchTargets, defaultTargets);

      // Force show conflict modal if there are any matches (integrated list)
      if (matches.length > 0) {
        showConflictModal = true;
        resolutions = {}; // Clear old resolutions
        renames = {};
      } else if (compatibility && !compatibility.compatible && !forceApply) {
        showConflictModal = true;
      } else {
        // No items to process and compatible, apply directly (rare case if matches handles everything)
        await applySnippet();
      }
    } catch (e: any) {
      const resolvedMessage = resolveErrorMessage(e);
      parameterError = resolvedMessage;
      applyError = resolvedMessage;
    } finally {
      checkingConflicts = false;
    }
  }

  function cancelConflictModal() {
    showConflictModal = false;
  }

  function toggleDiff(key: string) {
    const newSet = new Set(expandedDiffs);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    expandedDiffs = newSet;
  }

  async function applyWithResolutions() {
    showConflictModal = false;
    await applySnippet();
  }

  async function applySnippet() {
    if (!portId) return;

    applying = true;
    applyError = null;
    applySuccess = false;
    parameterError = null;

    try {
      const parameterValues = buildParameterValues();
      const { payloadResolutions, payloadRenames } = buildResolutionPayload();
      const response = await fetch('./api/gallery/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portId,
          yamlContent,
          fileName: item.file,
          resolutions: Object.keys(payloadResolutions).length > 0 ? payloadResolutions : undefined,
          renames: Object.keys(payloadRenames).length > 0 ? payloadRenames : undefined,
          parameterValues,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        // Throw object to preserve extra fields (minVersion, appVersion)
        const error = new Error(data.error || 'Failed to apply snippet');
        Object.assign(error, data);
        throw error;
      }

      applySuccess = true;
    } catch (e: any) {
      const resolvedMessage = resolveErrorMessage(e);
      parameterError = resolvedMessage;
      applyError = resolvedMessage;
    } finally {
      applying = false;
    }
  }

  function buildResolutionPayload() {
    const payloadResolutions: Record<string, 'overwrite' | 'skip' | 'rename'> = {
      ...resolutions,
    };
    const payloadRenames: Record<string, string> = { ...renames };

    for (const match of matches) {
      const action = matchActions[match.id] || 'overwrite';

      if (action === 'overwrite') {
        payloadResolutions[match.id] = 'overwrite';
        // Use selected target from dropdown instead of default matchedId
        payloadRenames[match.id] = matchTargets[match.id] || match.matchedId;
      } else if (action === 'skip') {
        payloadResolutions[match.id] = 'skip';
        delete payloadRenames[match.id];
      } else {
        delete payloadResolutions[match.id];
        delete payloadRenames[match.id];
      }
    }

    return { payloadResolutions, payloadRenames };
  }
</script>

<Modal
  open={true}
  width="900px"
  onclose={onClose}
  oncancel={onClose}
  ariaLabelledBy="gallery-preview-title"
  ariaDescribedBy="gallery-preview-desc"
  overflow="visible"
>
  <div class="modal-content-wrapper">
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
    <header class="modal-header">
      <div class="header-content">
        <h2 id="gallery-preview-title">{displayName}</h2>
        <div class="meta-minimal">
          <span class="meta-version">v{item.version}</span>
          <span class="meta-separator">·</span>
          <span class="meta-author">by {item.author}</span>
          <span class="meta-separator">·</span>
          <span class="meta-vendor">{item.vendorId}</span>
        </div>
      </div>
      <button class="close-btn" onclick={onClose} aria-label={$t('common.close')}> × </button>
    </header>

    {#if applySuccess}
      <div class="modal-body success-view">
        <div class="success-icon">✓</div>
        <p class="success-message">{$t('gallery.preview.success_with_backup')}</p>
      </div>
      <footer class="modal-footer success-footer">
        <div class="success-buttons">
          <Button
            variant="danger"
            onclick={handleRestart}
            disabled={restarting}
            isLoading={restarting}
            fullWidth
          >
            {$t('gallery.preview.restart_now')}
          </Button>
          <Button variant="secondary" onclick={onClose} fullWidth>
            {$t('common.close')}
          </Button>
        </div>
      </footer>
    {:else}
      <div class="modal-body">
        {#if displayDescription}
          <div class="description-section markdown-content">
            <div id="gallery-preview-desc">{@html htmlDescription}</div>
          </div>
        {/if}

        <div class="info-section">
          <div class="contents-summary">
            <h4>{$t('gallery.preview.contents')}</h4>
            <div class="summary-badges">
              {#each Object.entries(item.content_summary.entities) as [type, count], index (`${type}-${index}`)}
                <span class="badge entity"
                  >{$t('gallery.preview.entity_count', {
                    values: { type, count },
                  })}</span
                >
              {/each}
              {#if item.content_summary.automations > 0}
                <span class="badge automation"
                  >{$t('gallery.preview.automation_count', {
                    values: { count: item.content_summary.automations },
                  })}</span
                >
              {/if}
              {#if scriptCount > 0}
                <span class="badge script"
                  >{$t('gallery.preview.script_count', { values: { count: scriptCount } })}</span
                >
              {/if}
            </div>
          </div>

          {#if item.tags.length > 0}
            <div class="tags-section">
              <span class="info-label">{$t('gallery.tags')}</span>
              <div class="tags">
                {#each item.tags as tag, index (`${tag}-${index}`)}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        {#if hasParameters}
          <div class="parameter-section">
            <h4 class="parameter-section-title">{$t('gallery.preview.parameters.title')}</h4>
            <div class="parameter-list">
              {#each item.parameters as parameter (parameter.name)}
                <div class="parameter-item">
                  <label class="parameter-label" for={`parameter-${parameter.name}`}>
                    {resolveParameterLabel(parameter)}
                  </label>
                  {#if resolveParameterDescription(parameter)}
                    <p class="parameter-description">{resolveParameterDescription(parameter)}</p>
                  {/if}

                  {#if parameter.type === 'integer'}
                    <input
                      id={`parameter-${parameter.name}`}
                      type="number"
                      min={parameter.min}
                      max={parameter.max}
                      value={parameterInputs[parameter.name]}
                      placeholder={$t('gallery.preview.parameters.placeholder_integer')}
                      oninput={(event) =>
                        updateParameterInput(
                          parameter.name,
                          (event.target as HTMLInputElement).value,
                        )}
                    />
                  {:else if parameter.type === 'string'}
                    <input
                      id={`parameter-${parameter.name}`}
                      type="text"
                      value={parameterInputs[parameter.name]}
                      placeholder={$t('gallery.preview.parameters.placeholder_string')}
                      oninput={(event) =>
                        updateParameterInput(
                          parameter.name,
                          (event.target as HTMLInputElement).value,
                        )}
                    />
                  {:else if parameter.type === 'object[]' && parameter.schema}
                    <ParameterObjectArrayEditor
                      schema={parameter.schema}
                      value={JSON.parse(parameterInputs[parameter.name] || '[]')}
                      onUpdate={(newValue) =>
                        updateParameterInput(parameter.name, JSON.stringify(newValue))}
                    />
                  {:else}
                    {#if parameter.schema && Object.keys(parameter.schema).length > 0}
                      <div class="schema-chips">
                        {#each Object.entries(parameter.schema) as [fieldName, field] (fieldName)}
                          <div class="schema-chip">
                            <span class="schema-chip-name">{fieldName}</span>
                            <span class="schema-chip-label"
                              >{resolveSchemaFieldLabel(field, fieldName)}</span
                            >
                            <span class="schema-chip-type">{formatSchemaFieldType(field)}</span>
                            {#if formatSchemaFieldConstraints(field)}
                              <span class="schema-chip-constraints"
                                >{formatSchemaFieldConstraints(field)}</span
                              >
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                    <textarea
                      id={`parameter-${parameter.name}`}
                      rows="4"
                      value={parameterInputs[parameter.name]}
                      placeholder={$t('gallery.preview.parameters.placeholder_json')}
                      oninput={(event) =>
                        updateParameterInput(
                          parameter.name,
                          (event.target as HTMLTextAreaElement).value,
                        )}
                    ></textarea>
                  {/if}
                </div>
              {/each}
            </div>

            {#if parameterError}
              <div class="parameter-error">⚠️ {parameterError}</div>
            {/if}
          </div>
        {/if}

        <div class="yaml-section">
          <button class="section-header-toggle" onclick={() => (showYaml = !showYaml)}>
            <h4>{$t('gallery.preview.yaml_content')}</h4>
            <span class="toggle-icon">{showYaml ? '▲' : '▼'}</span>
          </button>

          {#if showYaml}
            {#if loadingYaml}
              <div class="yaml-loading">
                <div class="spinner"></div>
              </div>
            {:else if yamlError}
              <div class="yaml-error">⚠️ {yamlError}</div>
            {:else}
              <pre class="yaml-content"><code>{yamlContent}</code></pre>
            {/if}
          {/if}
        </div>

        <div class="giscus-section">
          {#key giscusKey}
            <Giscus
              repo="wooooooooooook/homenet2mqtt"
              repoId="R_kgDOQQ8nWw"
              category="Q&A"
              categoryId="DIC_kwDOQQ8nW84C6gGd"
              mapping="specific"
              term={item.file}
              reactionsEnabled="1"
              emitMetadata="0"
              inputPosition="bottom"
              theme={isIngress ? `${STATS_WORKER_URL}/giscus-theme.css` : 'dark'}
              lang={$locale?.startsWith('en') ? 'en' : 'ko'}
            />
          {/key}

          <!-- HA ingress 환경 우회: Discussion 이동 + 익명 댓글 -->
          {#if isIngress}
            <div class="discussion-fallback">
              <!-- 안내 문구: Discussion 직접 이동 유도 -->
              <div class="discussion-guide">
                <span class="discussion-guide-text">
                  {$t('gallery.preview.discussion.guide')}
                </span>
                <button
                  id="gallery-open-discussion-btn"
                  class="discussion-link-inline"
                  onclick={openDiscussion}
                  disabled={discussionLoading}
                >
                  {#if discussionLoading}
                    <span class="btn-spinner-sm"></span>
                  {:else}
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                      style="display: inline; vertical-align: -2px; margin-right: 3px;"
                    >
                      <path
                        d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
                      />
                    </svg>
                    {$t('gallery.preview.discussion.open_btn')}
                  {/if}
                </button>
              </div>

              {#if discussionError}
                <p class="discussion-error">⚠️ {discussionError}</p>
              {/if}

              <!-- 익명 댓글 폼 (항상 펼침) -->
              <div class="anonymous-comment-form">
                {#if commentSuccess}
                  <div class="comment-success">
                    ✅ {$t('gallery.preview.discussion.success')}
                  </div>
                {:else}
                  <p class="anon-form-title">{$t('gallery.preview.discussion.anon_form_title')}</p>
                  <div class="anonymous-fields">
                    <input
                      id="gallery-anon-name-input"
                      type="text"
                      class="anon-input"
                      placeholder={$t('gallery.preview.discussion.nickname_placeholder')}
                      bind:value={anonymousName}
                      maxlength="50"
                      disabled={commentSubmitting}
                    />
                    <textarea
                      id="gallery-anon-message-input"
                      class="anon-textarea"
                      placeholder={$t('gallery.preview.discussion.message_placeholder')}
                      bind:value={anonymousMessage}
                      maxlength="2000"
                      rows="4"
                      disabled={commentSubmitting}
                    ></textarea>
                  </div>

                  {#if commentError}
                    <p class="comment-error">⚠️ {commentError}</p>
                  {/if}

                  <div class="anonymous-actions">
                    <span class="anon-notice">
                      {$t('gallery.preview.discussion.bot_notice', { values: { botAccount: '' } })
                        .split('{botAccount}')
                        .shift()}
                      <a
                        href="https://github.com/wooooooooooook"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="anon-bot-link">wooooooooooook</a
                      >
                      {$t('gallery.preview.discussion.bot_notice', { values: { botAccount: '' } })
                        .split('{botAccount}')
                        .pop()}
                    </span>
                    <button
                      id="gallery-anon-submit-btn"
                      class="anon-submit-btn"
                      onclick={submitAnonymousComment}
                      disabled={commentSubmitting || !anonymousMessage.trim()}
                    >
                      {#if commentSubmitting}
                        <span class="btn-spinner"></span>
                        {$t('gallery.preview.discussion.submitting')}
                      {:else}
                        {$t('gallery.preview.discussion.submit_btn')}
                      {/if}
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <footer class="modal-footer">
        {#if applyError}
          <div class="error-message">⚠️ {applyError}</div>
        {/if}

        <div class="footer-controls">
          {#if portId}
            <div class="target-port-wrapper">
              <button
                class="target-port-info"
                onmouseenter={() => (showPortHint = true)}
                onmouseleave={() => (showPortHint = false)}
                onclick={() => (showPortHint = !showPortHint)}
                type="button"
              >
                <span class="info-label">{$t('gallery.preview.target_port')}</span>
                <span class="info-value">{portId}</span>
              </button>

              {#if showPortHint}
                <HintBubble onDismiss={() => (showPortHint = false)}>
                  {$t('gallery.preview.target_port_tooltip')}
                </HintBubble>
              {/if}
            </div>
          {/if}
          <div class="action-buttons">
            <Button variant="secondary" onclick={onClose}>
              {$t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onclick={confirmAndCheckConflicts}
              isLoading={applying || checkingConflicts}
              disabled={!portId || loadingYaml}
            >
              {#if applying}
                {$t('gallery.preview.applying')}
              {:else if checkingConflicts}
                {$t('gallery.preview.checking')}
              {:else}
                {$t('gallery.preview.preview_button')}
              {/if}
            </Button>
          </div>
        </div>
      </footer>
    {/if}
  </div>
</Modal>

<svelte:window onclick={handleWindowClick} />

<Modal
  open={showConflictModal}
  width="700px"
  onclose={cancelConflictModal}
  oncancel={cancelConflictModal}
>
  <div class="conflict-modal-wrapper">
    {#if compatibility && !compatibility.compatible}
      <div class="compatibility-warning">
        <h4>⚠️ {$t('gallery.preview.compatibility.incompatible')}</h4>
        <p class="mismatch-label">{$t('gallery.preview.compatibility.mismatch_label')}:</p>
        <ul class="mismatch-list">
          {#each compatibility.mismatches as mismatch, index (`${mismatch.field}-${index}`)}
            <li>
              <code>{mismatch.field}</code>:
              <span class="expected"
                >{$t('gallery.preview.compatibility.expected')}: {JSON.stringify(
                  mismatch.expected,
                )}</span
              >
              <span class="actual"
                >{$t('gallery.preview.compatibility.actual')}: {JSON.stringify(
                  mismatch.actual,
                )}</span
              >
            </li>
          {/each}
        </ul>
        <label class="force-apply-checkbox">
          <input type="checkbox" bind:checked={forceApply} />
          {$t('gallery.preview.compatibility.force_apply')}
        </label>
        <p class="force-warning">{$t('gallery.preview.compatibility.force_apply_warning')}</p>
      </div>
    {/if}

    {#if matches.length > 0}
      <h3>{$t('gallery.preview.match_detected')}</h3>

      {#if duplicateTargets.size > 0}
        <div class="duplicate-warning">
          ⚠️ {$t('gallery.preview.duplicate_target_warning')}
        </div>
      {/if}

      <div class="conflict-list">
        {#each matches as match (match.id)}
          {@const selectedTarget = matchTargets[match.id] || match.matchedId}
          {@const selectedCandidate = match.candidates?.find((c) => c.matchId === selectedTarget)}
          {@const selectedExistingYaml = selectedCandidate?.existingYaml || match.existingYaml}
          {@const isDuplicate =
            duplicateTargets.has(selectedTarget) && matchActions[match.id] === 'overwrite'}
          <div
            class="conflict-item"
            class:duplicate={isDuplicate}
            class:skipped={matchActions[match.id] === 'skip'}
          >
            <div class="conflict-header">
              <span class="conflict-id">
                <span class="item-type-label">{formatItemLabel(match.type, match.entityType)}</span>
                ID: <strong>{match.id}</strong>
              </span>
              {#if match.candidates && match.candidates.length > 0}
                {#if matchActions[match.id] === 'overwrite'}
                  <div class="target-wrapper">
                    <span class="target-label">{$t('gallery.preview.target_label')}</span>
                    <!-- Custom Dropdown -->
                    <div class="custom-select-container">
                      <button
                        class="select-trigger"
                        onclick={(e) => toggleDropdown(match.id, e)}
                        class:active={openDropdownMatchId === match.id}
                      >
                        <span class="trigger-text">
                          {#if selectedCandidate}
                            {selectedCandidate.matchId} ({Math.round(
                              selectedCandidate.similarity * 100,
                            )}%)
                            {#if selectedCandidate.name}
                              - {selectedCandidate.name}
                            {/if}
                          {:else}
                            Select Target
                          {/if}
                        </span>
                        <span class="trigger-arrow">▼</span>
                      </button>

                      {#if openDropdownMatchId === match.id}
                        <div
                          class="select-options"
                          role="listbox"
                          tabindex="-1"
                          onclick={(e) => e.stopPropagation()}
                          onkeydown={(e) => e.stopPropagation()}
                        >
                          {#each match.candidates as candidate}
                            <div
                              class="select-option"
                              role="option"
                              aria-selected={selectedTarget === candidate.matchId}
                              tabindex="0"
                              class:selected={selectedTarget === candidate.matchId}
                              class:high-match={candidate.similarity >= 0.8}
                              onclick={() => selectOption(match.id, candidate.matchId)}
                              onkeydown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  selectOption(match.id, candidate.matchId);
                                }
                              }}
                            >
                              <div class="option-row-1">
                                <span class="option-id">{candidate.matchId}</span>
                                <span class="option-percent">
                                  ({$t('gallery.preview.match_rate', {
                                    values: { n: Math.round(candidate.similarity * 100) },
                                  })})
                                </span>
                              </div>
                              {#if candidate.name}
                                <div class="option-row-2">
                                  {candidate.name}
                                </div>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              {:else}
                <span class="match-id">
                  <!-- No candidates available -->
                </span>
              {/if}
              {#if isDuplicate}
                <span class="duplicate-badge">⚠️</span>
              {/if}
              {#if matchActions[match.id] !== 'skip'}
                <button class="toggle-diff-btn" onclick={() => toggleDiff(`match-${match.id}`)}>
                  {expandedDiffs.has(`match-${match.id}`) ? '▲' : '▼'}
                  {$t('gallery.preview.diff_title')}
                </button>
              {/if}
            </div>

            <div class="resolution-options">
              <label class="resolution-option">
                <input
                  type="radio"
                  name="match-resolution-{match.id}"
                  value="overwrite"
                  checked={matchActions[match.id] === 'overwrite'}
                  onchange={() => (matchActions[match.id] = 'overwrite')}
                  disabled={(!match.candidates || match.candidates.length === 0) &&
                    (match.similarity ?? 0) < 0.8}
                />
                {$t('gallery.preview.resolution.overwrite')}
              </label>

              <label class="resolution-option">
                <input
                  type="radio"
                  name="match-resolution-{match.id}"
                  value="skip"
                  checked={matchActions[match.id] === 'skip'}
                  onchange={() => (matchActions[match.id] = 'skip')}
                />
                {$t('gallery.preview.resolution.skip')}
              </label>

              <label class="resolution-option">
                <input
                  type="radio"
                  name="match-resolution-{match.id}"
                  value="add"
                  checked={matchActions[match.id] === 'add'}
                  onchange={() => {
                    matchActions[match.id] = 'add';
                    // Initialize rename with original ID if not set
                    if (!renames[match.id]) {
                      renames[match.id] = match.id;
                    }
                  }}
                />
                {$t('gallery.preview.resolution.add_new')}
              </label>

              {#if matchActions[match.id] === 'add'}
                <div class="new-id-input-wrapper">
                  <span class="new-id-label">New ID:</span>
                  <input
                    type="text"
                    class="new-id-input"
                    class:error={checkDuplicateId(match, renames[match.id] || match.id)}
                    value={renames[match.id] || match.id}
                    oninput={(e) => {
                      const val = e.currentTarget.value;
                      renames[match.id] = val;
                    }}
                  />
                  {#if checkDuplicateId(match, renames[match.id] || match.id)}
                    <span class="new-id-error">ID already exists</span>
                  {/if}
                </div>
              {/if}
            </div>

            {#if expandedDiffs.has(`match-${match.id}`) && matchActions[match.id] !== 'skip'}
              <div class="diff-container monaco-view">
                {#key `${matchActions[match.id]}-${selectedTarget}`}
                  <MonacoDiffEditor
                    original={getOriginalDiffContent(matchActions[match.id], selectedExistingYaml)}
                    modified={getModifiedDiffContent(
                      matchActions[match.id],
                      match.newYaml,
                      selectedExistingYaml,
                      match.id,
                    )}
                  />
                {/key}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <div class="confirm-buttons">
      <Button variant="secondary" onclick={cancelConflictModal}>
        {$t('gallery.preview.cancel')}
      </Button>
      <Button
        variant="primary"
        onclick={applyWithResolutions}
        disabled={!!(compatibility && !compatibility.compatible && !forceApply)}
      >
        {$t('gallery.preview.apply')}
      </Button>
    </div>
  </div>
</Modal>

<style>
  .modal-content-wrapper {
    background: #1e293b;
    width: 100%;
    /* Fit inside Modal 90dvh */
    max-height: 85dvh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  }

  .header-content h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #f1f5f9;
    margin: 0 0 0.25rem 0;
  }

  .meta-minimal {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .meta-separator {
    opacity: 0.5;
  }

  .meta-version {
    color: #60a5fa;
    font-weight: 500;
  }

  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: #f1f5f9;
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .info-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .parameter-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.6);
  }

  .parameter-section-title {
    font-size: 1rem;
    font-weight: 600;
    color: #f1f5f9;
    margin: 0 0 0.5rem 0;
  }

  .parameter-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .parameter-item {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .parameter-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #f1f5f9;
  }

  .parameter-description {
    margin: 0;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .parameter-item input,
  .parameter-item textarea {
    padding: 0.6rem 0.75rem;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 0.85rem;
  }

  .parameter-item textarea {
    resize: vertical;
    min-height: 90px;
  }

  .parameter-error {
    color: #f87171;
    font-size: 0.8rem;
  }

  .description-section {
    background: rgba(15, 23, 42, 0.4);
    border-left: 3px solid #3b82f6;
    padding: 1rem 1.25rem;
    border-radius: 4px;
  }

  .description-section :global(p) {
    margin: 0.5rem 0;
    font-size: 0.95rem;
    line-height: 1.6;
    color: #e2e8f0;
  }

  .description-section :global(p:first-child) {
    margin-top: 0;
  }

  .description-section :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
    color: #e2e8f0;
  }

  .markdown-content :global(li) {
    margin-bottom: 0.25rem;
  }

  .markdown-content :global(code) {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-family: 'Fira Code', monospace;
    color: #60a5fa;
  }

  .markdown-content :global(a) {
    color: #3b82f6;
    text-decoration: underline;
  }

  .markdown-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1.25rem 0;
    font-size: 0.9rem;
    display: block;
    overflow-x: auto;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.2);
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    padding: 0.75rem 1rem;
    border: 1px solid rgba(148, 163, 184, 0.1);
    text-align: left;
    min-width: 120px;
  }

  .markdown-content :global(th) {
    background: rgba(59, 130, 246, 0.1);
    font-weight: 600;
    color: #60a5fa;
    border-bottom: 2px solid rgba(59, 130, 246, 0.2);
  }

  .markdown-content :global(tr:nth-child(even)) {
    background: rgba(30, 41, 59, 0.3);
  }

  .markdown-content :global(tr:hover) {
    background: rgba(59, 130, 246, 0.05);
  }

  .target-port-wrapper {
    position: relative;
  }

  .target-port-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.75rem;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.15);
    border-radius: 6px;
    cursor: help;
    transition: all 0.2s ease;
  }

  .target-port-info:hover {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .target-port-info .info-label {
    text-transform: none;
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .target-port-info .info-value {
    font-size: 0.85rem;
    font-weight: 600;
    color: #60a5fa;
    font-family: 'Fira Code', monospace;
  }

  .info-label {
    font-size: 0.75rem;
    color: #64748b;
    text-transform: uppercase;
  }

  .info-value {
    font-size: 0.85rem;
    font-weight: 600;
    color: #f1f5f9;
    font-family: 'Fira Code', monospace;
  }

  .giscus-section {
    width: 100%;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
  }

  /* GitHub Discussion 우회 UI */
  .discussion-fallback {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Discussion 이동 유도 안내줄 */
  .discussion-guide {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    font-size: 0.8rem;
    color: #94a3b8;
    margin-bottom: 0.25rem;
  }

  .discussion-guide-text {
    flex-shrink: 0;
  }

  .discussion-link-inline {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.55rem;
    background: rgba(30, 215, 96, 0.08);
    border: 1px solid rgba(30, 215, 96, 0.2);
    border-radius: 5px;
    color: #4ade80;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .discussion-link-inline:hover:not(:disabled) {
    background: rgba(30, 215, 96, 0.16);
    border-color: rgba(30, 215, 96, 0.4);
  }

  .discussion-link-inline:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .discussion-error {
    color: #f87171;
    font-size: 0.8rem;
    margin: 0.25rem 0 0;
  }

  .anonymous-comment-form {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(99, 102, 241, 0.2);
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: slideDown 0.2s ease;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .anonymous-fields {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .anon-input,
  .anon-textarea {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    color: #f1f5f9;
    font-size: 0.85rem;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }

  .anon-input:focus,
  .anon-textarea:focus {
    outline: none;
    border-color: rgba(99, 102, 241, 0.5);
  }

  .anon-input:disabled,
  .anon-textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .anon-textarea {
    resize: vertical;
    min-height: 90px;
    font-family: inherit;
  }

  .anonymous-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .anon-form-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: #cbd5e1;
    margin: 0 0 0.25rem;
  }

  .anon-notice {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .anon-bot-link {
    color: #818cf8;
    text-decoration: none;
    transition: color 0.15s;
  }

  .anon-bot-link:hover {
    color: #a5b4fc;
    text-decoration: underline;
  }

  .anon-submit-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 1rem;
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.35);
    border-radius: 6px;
    color: #818cf8;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .anon-submit-btn:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.25);
    border-color: rgba(99, 102, 241, 0.55);
  }

  .anon-submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .comment-success {
    color: #4ade80;
    font-size: 0.85rem;
    padding: 0.5rem 0;
  }

  .comment-error {
    color: #f87171;
    font-size: 0.8rem;
    margin: 0;
  }

  .btn-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .btn-spinner-sm {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .contents-summary h4 {
    font-size: 0.85rem;
    color: #94a3b8;
    margin: 0 0 0.5rem 0;
  }

  .summary-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
  }

  .badge.entity {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .badge.automation {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  .badge.script {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .tags-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .tag {
    font-size: 0.7rem;
    color: #94a3b8;
    background: rgba(100, 116, 139, 0.2);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }

  .yaml-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-header-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: rgba(15, 23, 42, 0.3);
    border: 1px solid rgba(148, 163, 184, 0.1);
    padding: 0.75rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .section-header-toggle:hover {
    background: rgba(15, 23, 42, 0.5);
    border-color: rgba(148, 163, 184, 0.2);
  }

  .section-header-toggle h4 {
    font-size: 0.85rem;
    color: #94a3b8;
    margin: 0;
  }

  .toggle-icon {
    font-size: 0.7rem;
    color: #64748b;
  }

  .yaml-loading {
    display: flex;
    justify-content: center;
    padding: 2rem;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(59, 130, 246, 0.2);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .yaml-error {
    color: #f87171;
    padding: 1rem;
    text-align: center;
  }

  .yaml-content {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 8px;
    padding: 1rem;
    overflow: auto;
    max-height: 300px;
    margin: 0;
  }

  .yaml-content code {
    font-family: 'Fira Code', 'Consolas', monospace;
    font-size: 0.8rem;
    color: #e2e8f0;
    white-space: pre;
  }

  .modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid rgba(148, 163, 184, 0.1);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .success-message {
    color: #4ade80;
    font-size: 0.9rem;
    text-align: center;
  }

  .error-message {
    color: #f87171;
    font-size: 0.9rem;
    text-align: center;
  }

  .new-id-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    margin-left: 1.8rem; /* Align with radio text */
  }

  .new-id-label {
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .new-id-input {
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    color: #e2e8f0;
    font-size: 0.85rem;
    font-family: 'Fira Code', monospace;
  }

  .new-id-input:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .new-id-input.error {
    border-color: #ef4444;
  }

  .new-id-error {
    font-size: 0.75rem;
    color: #ef4444;
  }

  .footer-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
  }

  @media (max-width: 640px) {
    .modal-content-wrapper {
      max-height: 100dvh;
      border-radius: 0;
    }

    .description-section :global(p) {
      font-size: 0.85rem;
    }

    .footer-controls {
      flex-direction: column;
      align-items: stretch;
    }

    .action-buttons {
      justify-content: flex-end;
    }
  }

  /* Conflict Modal Styles */
  .conflict-modal-wrapper {
    background: #1e293b;
    padding: 1.5rem;
    max-height: 90dvh;
    overflow-y: auto;
  }

  .conflict-modal-wrapper h3 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 0.5rem 0.5rem;
  }

  .conflict-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .conflict-item {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 8px;
    padding: 1rem;
  }

  .conflict-item.skipped .conflict-header {
    opacity: 0.5;
    text-decoration: line-through;
  }

  .conflict-item.skipped .conflict-id strong {
    color: #94a3b8;
  }

  .conflict-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }

  .conflict-id {
    font-family: 'Fira Code', 'Consolas', monospace;
    font-size: 0.85rem;
    color: #f1f5f9;
  }

  .item-type-label {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    margin-right: 0.5rem;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: 3px;
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.4);
  }

  .target-label {
    margin-right: 0.5rem;
    font-size: 0.9em;
    color: #94a3b8;
  }

  .match-id {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .custom-select-container {
    position: relative;
    flex: 1;
    min-width: 200px;
    max-width: 500px;
  }

  .select-trigger {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 4px;
    color: #f1f5f9;
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
  }

  .select-trigger:hover {
    border-color: rgba(148, 163, 184, 0.5);
  }

  .select-trigger.active {
    border-color: #3b82f6;
  }

  .trigger-text {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 0.5rem;
  }

  .trigger-arrow {
    font-size: 0.7rem;
    color: #94a3b8;
  }

  .select-options {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: #1e293b;
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 6px;
    max-height: 250px;
    overflow-y: auto;
    z-index: 50;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .select-option {
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    transition: background 0.15s ease;
  }

  .select-option:last-child {
    border-bottom: none;
  }

  .select-option:hover {
    background: rgba(148, 163, 184, 0.1);
  }

  .select-option.selected {
    background: rgba(59, 130, 246, 0.15);
    border-left: 2px solid #3b82f6;
  }

  .select-option.high-match {
    background: rgba(16, 185, 129, 0.15); /* Green tint */
    border-left: 2px solid #10b981;
  }

  .select-option.high-match:hover {
    background: rgba(16, 185, 129, 0.25);
  }

  /* Selected overrides high-match if active */
  .select-option.selected.high-match {
    background: rgba(16, 185, 129, 0.3);
    border-left-color: #10b981;
  }

  .option-row-1 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.1rem;
  }

  .option-id {
    font-family: 'Fira Code', monospace;
    font-weight: 600;
    color: #f1f5f9;
    font-size: 0.85rem;
  }

  .option-percent {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .select-option.high-match .option-percent {
    color: #34d399; /* Green text */
    font-weight: 600;
  }

  .option-row-2 {
    font-size: 0.8rem;
    color: #cbd5e1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .duplicate-warning {
    background: rgba(234, 179, 8, 0.15);
    border: 1px solid rgba(234, 179, 8, 0.4);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    color: #eab308;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }

  .conflict-item.duplicate {
    border-color: rgba(234, 179, 8, 0.5);
    background: rgba(234, 179, 8, 0.08);
  }

  .duplicate-badge {
    font-size: 1rem;
    margin-left: 0.25rem;
  }

  .toggle-diff-btn {
    background: transparent;
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #94a3b8;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .toggle-diff-btn:hover {
    border-color: rgba(148, 163, 184, 0.4);
    color: #f1f5f9;
  }

  .diff-container {
    margin-top: 0.5rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 6px;
    background: #1e1e1e;
    height: 400px;
    overflow: hidden;
    position: relative;
  }

  .resolution-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }

  .resolution-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: #94a3b8;
    cursor: pointer;
    padding: 0.4rem 0.8rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 6px;
    background: rgba(30, 41, 59, 0.5);
    transition: all 0.2s ease;
  }

  .resolution-option:hover {
    background: rgba(148, 163, 184, 0.1);
    border-color: rgba(148, 163, 184, 0.4);
  }

  /* 라디오 버튼 숨기기 (선택적) 또는 기본 스타일 유지 */
  .resolution-option input[type='radio'] {
    accent-color: #3b82f6;
    margin: 0;
  }

  @media (max-width: 640px) {
    .conflict-modal-wrapper {
      padding: 1.5rem 0.5rem;
    }
    .diff-container {
      grid-template-columns: 1fr;
    }

    .resolution-options {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  /* Compatibility styles */
  .compatibility-warning {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .compatibility-warning h4 {
    font-size: 0.95rem;
    color: #f87171;
    margin: 0 0 0.75rem 0;
  }

  .compatibility-warning .mismatch-label {
    font-size: 0.8rem;
    color: #94a3b8;
    margin: 0 0 0.5rem 0;
  }

  .compatibility-warning .mismatch-list {
    font-size: 0.8rem;
    color: #e2e8f0;
    margin: 0 0 0.75rem 0;
    padding-left: 1.25rem;
  }

  .compatibility-warning .mismatch-list li {
    margin-bottom: 0.4rem;
    line-height: 1.5;
  }

  .compatibility-warning .mismatch-list code {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-family: 'Fira Code', monospace;
    color: #60a5fa;
  }

  .compatibility-warning .mismatch-list .expected {
    color: #f87171;
    margin-left: 0.5rem;
  }

  .compatibility-warning .mismatch-list .actual {
    color: #64748b;
    margin-left: 0.5rem;
  }

  .compatibility-warning .force-apply-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: #e2e8f0;
    cursor: pointer;
    margin: 0.75rem 0 0.5rem 0;
  }

  .compatibility-warning .force-apply-checkbox input[type='checkbox'] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .compatibility-warning .force-warning {
    font-size: 0.75rem;
    color: #f87171;
    opacity: 0.8;
    margin: 0;
  }

  /* Success View Styles */
  .success-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    flex: 1;
  }

  .success-icon {
    font-size: 2rem;
    color: #4ade80;
    line-height: 1;
  }

  .success-footer {
    justify-content: center;
  }

  .success-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
  }

  .confirm-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }

  /* Schema Chips Styles */
  .schema-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .schema-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-radius: 6px;
    font-size: 0.75rem;
    line-height: 1.3;
  }

  .schema-chip-name {
    font-family: 'Fira Code', 'Consolas', monospace;
    font-weight: 600;
    color: #60a5fa;
  }

  .schema-chip-label {
    color: #e2e8f0;
  }

  .schema-chip-label::before {
    content: '-';
    margin-right: 0.25rem;
    color: #64748b;
  }

  .schema-chip-type {
    color: #a78bfa;
    font-weight: 500;
  }

  .schema-chip-type::before {
    content: '(';
    color: #64748b;
  }

  .schema-chip-type::after {
    content: ')';
    color: #64748b;
  }

  .schema-chip-constraints {
    color: #fbbf24;
    font-size: 0.7rem;
  }

  .schema-chip-constraints::before {
    content: '|';
    margin-right: 0.25rem;
    color: #64748b;
  }
</style>
