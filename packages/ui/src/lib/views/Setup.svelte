<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/Button.svelte';

  // Define types locally since we might not have them exported perfectly for this view
  type TemplateFile = {
    filename: string;
    description?: string;
  };

  let templates = $state<TemplateFile[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedTemplate = $state<string | null>(null);
  let applying = $state(false);

  // Load templates on mount
  onMount(async () => {
    try {
      const res = await fetch('./api/setup/templates');
      if (!res.ok) throw new Error('Failed to load templates');
      const data = await res.json();
      templates = data.templates;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      loading = false;
    }
  });

  async function applyTemplate() {
    if (!selectedTemplate) return;
    applying = true;
    error = null;

    try {
      const res = await fetch('./api/setup/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: selectedTemplate }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to apply template');
      }

      // Reload the page to reconnect and start fresh
      window.location.reload();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error during setup';
      applying = false;
    }
  }
</script>

<div class="setup-container">
  <div class="card">
    <h1>환영합니다!</h1>
    <p class="subtitle">시작하기 전에 설정 파일을 선택해주세요.</p>

    {#if loading}
      <div class="loading">템플릿 목록을 불러오는 중...</div>
    {:else if error}
      <div class="error-msg">{error}</div>
    {:else}
      <div class="template-list">
        {#each templates as tmpl}
          <button
            class="template-item"
            class:selected={selectedTemplate === tmpl.filename}
            onclick={() => (selectedTemplate = tmpl.filename)}
          >
            <div class="radio"></div>
            <span class="name">{tmpl.filename}</span>
          </button>
        {/each}
      </div>

      <div class="actions">
        <Button
          variant="primary"
          disabled={!selectedTemplate || applying}
          onclick={applyTemplate}
          isLoading={applying}
        >
          {applying ? '설정 적용 중...' : '설정 적용 및 시작'}
        </Button>
      </div>
    {/if}
  </div>
</div>

<style>
  .setup-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: #0f172a;
    padding: 1rem;
  }

  .card {
    background: #1e293b;
    border-radius: 12px;
    padding: 2rem;
    width: 100%;
    max-width: 500px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    color: #e2e8f0;
  }

  h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    text-align: center;
  }

  .subtitle {
    margin: 0 0 2rem 0;
    color: #94a3b8;
    text-align: center;
  }

  .template-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 400px;
    overflow-y: auto;
    margin-bottom: 2rem;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 0.5rem;
  }

  .template-item {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    color: #e2e8f0;
    width: 100%;
    text-align: left;
    transition: all 0.2s;
  }

  .template-item:hover {
    background: #334155;
  }

  .template-item.selected {
    background: #334155;
    border-color: #3b82f6;
  }

  .radio {
    width: 16px;
    height: 16px;
    border: 2px solid #64748b;
    border-radius: 50%;
    margin-right: 1rem;
    position: relative;
  }

  .template-item.selected .radio {
    border-color: #3b82f6;
  }

  .template-item.selected .radio::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 6px;
    height: 6px;
    background: #3b82f6;
    border-radius: 50%;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .error-msg {
    color: #ef4444;
    text-align: center;
    margin-bottom: 1rem;
    background: rgba(239, 68, 68, 0.1);
    padding: 0.75rem;
    border-radius: 6px;
  }

  .loading {
    text-align: center;
    color: #94a3b8;
    padding: 2rem;
  }
</style>
