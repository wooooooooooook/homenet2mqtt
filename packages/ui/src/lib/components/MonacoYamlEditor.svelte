<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { editor as MonacoEditor, IDisposable } from 'monaco-editor';
  import type { MonacoYaml } from 'monaco-yaml';

  type MonacoInstance = typeof import('monaco-editor');

  let {
    value,
    onChange,
    readOnly = false,
    ariaLabel = 'YAML editor',
    ariaDescribedBy,
    placeholder = '',
    class: className = '',
  }: {
    value: string;
    onChange?: (nextValue: string) => void;
    readOnly?: boolean;
    ariaLabel?: string;
    ariaDescribedBy?: string;
    placeholder?: string;
    class?: string;
  } = $props();

  let editorHost: HTMLDivElement | null = null;
  let fallbackValue = $state('');
  let isReady = $state(false);
  let isLoading = $state(false);
  let loadError = $state<string | null>(null);

  let editor: MonacoEditor.IStandaloneCodeEditor | null = null;
  let modelChangeDisposable: IDisposable | null = null;
  let monaco: MonacoInstance | null = null;
  let isApplyingExternalChange = false;
  let yamlConfig: MonacoYaml | null = null;

  const initializeEditor = async () => {
    if (isLoading || isReady || !editorHost) return;

    isLoading = true;
    const [{ default: EditorWorker }, { default: YamlWorker }] = await Promise.all([
      import('monaco-editor/esm/vs/editor/editor.worker?worker'),
      import('monaco-yaml/yaml.worker?worker'),
    ]);

    if (typeof self !== 'undefined') {
      self.MonacoEnvironment = {
        getWorker(_moduleId, label) {
          return label === 'yaml' ? new YamlWorker() : new EditorWorker();
        },
      };
    }

    const monacoModule = await import('monaco-editor/esm/vs/editor/editor.api');
    const { configureMonacoYaml } = await import('monaco-yaml');

    monaco = monacoModule;

    yamlConfig = configureMonacoYaml(monacoModule, {
      enableSchemaRequest: true,
      completion: true,
      validate: true,
      hover: true,
      format: true,
      schemas: [],
    });

    editor = monacoModule.editor.create(editorHost, {
      value,
      language: 'yaml',
      readOnly,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      tabSize: 2,
      insertSpaces: true,
      automaticLayout: true,
      theme: 'vs-dark',
      ariaLabel,
    });

    modelChangeDisposable = editor.onDidChangeModelContent(() => {
      if (isApplyingExternalChange) return;
      onChange?.(editor?.getValue() ?? '');
    });

    isReady = true;
    isLoading = false;
    loadError = null;
  };

  const handleFallbackInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement;
    fallbackValue = target.value;
    onChange?.(fallbackValue);
  };

  onMount(() => {
    fallbackValue = value;
    initializeEditor().catch((err) => {
      loadError = err instanceof Error ? err.message : 'Failed to load editor';
      isLoading = false;
    });
  });

  onDestroy(() => {
    modelChangeDisposable?.dispose();
    editor?.dispose();
    editor = null;
    monaco = null;
    yamlConfig?.dispose();
    yamlConfig = null;
  });

  $effect(() => {
    fallbackValue = value;

    if (!editor) return;
    if (value === editor.getValue()) return;

    isApplyingExternalChange = true;
    editor.setValue(value);
    isApplyingExternalChange = false;
  });

  $effect(() => {
    if (!editor) return;
    editor.updateOptions({ readOnly });
  });
</script>

<div
  class={`monaco-yaml-editor ${className}`}
  aria-label={ariaLabel}
  aria-describedby={ariaDescribedBy}
  aria-busy={isLoading}
>
  {#if !isReady}
    <textarea
      class="fallback-textarea"
      bind:value={fallbackValue}
      spellcheck="false"
      placeholder={placeholder}
      readonly={readOnly}
      oninput={handleFallbackInput}
    ></textarea>
    {#if loadError}
      <div class="load-error" role="alert">{loadError}</div>
    {/if}
  {/if}
  <div class="monaco-host" class:ready={isReady} bind:this={editorHost}></div>
</div>

<style>
  .monaco-yaml-editor {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .monaco-host {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .monaco-host.ready {
    opacity: 1;
    pointer-events: auto;
  }

  .fallback-textarea {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    resize: none;
    outline: none;
  }

  .load-error {
    position: absolute;
    bottom: 0.5rem;
    left: 0.75rem;
    right: 0.75rem;
    font-size: 0.8rem;
    color: #fca5a5;
  }
</style>
