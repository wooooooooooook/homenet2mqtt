<script lang="ts">
  import { t, locale } from 'svelte-i18n';
  import Button from './Button.svelte';
  import type { GallerySchemaField } from '../types';

  let {
    schema,
    value = [],
    onUpdate,
  }: {
    schema: Record<string, GallerySchemaField>;
    value?: any[];
    onUpdate: (newValue: any[]) => void;
  } = $props();

  // Handle initialization and Svelte 5 reactivity
  let items = $state<any[]>([]);

  $effect(() => {
    if (Array.isArray(value)) {
      const valueJson = JSON.stringify(value);
      if (valueJson !== JSON.stringify(items)) {
        items = JSON.parse(valueJson);
      }
    }
  });

  function addItem() {
    const newItem: any = {};
    for (const [key, field] of Object.entries(schema)) {
      // Initialize with reasonable defaults based on type/constraints
      if (field.type === 'integer') {
        newItem[key] = field.min !== undefined ? field.min : 0;
      } else if (field.type === 'boolean') {
        newItem[key] = false;
      } else {
        newItem[key] = '';
      }
    }
    items = [...items, newItem];
    onUpdate(items);
  }

  function removeItem(index: number) {
    items = items.filter((_: any, i: number) => i !== index);
    onUpdate(items);
  }

  function updateField(index: number, key: string, newValue: any) {
    items[index] = { ...items[index], [key]: newValue };
    onUpdate(items);
  }

  function resolveLabel(field: GallerySchemaField, key: string) {
    if ($locale?.startsWith('en')) {
      return field.label_en || field.label || key;
    }
    return field.label || key;
  }
</script>

<div class="object-array-editor">
  <div class="items-list">
    {#each items as item, index (index)}
      <div class="item-card">
        <div class="item-header">
          <span class="item-index"
            >{$t('gallery.preview.parameters.item_index', { values: { index: index + 1 } })}</span
          >
          <button class="remove-btn" onclick={() => removeItem(index)} type="button">
            <span class="remove-icon">×</span>
            {$t('gallery.preview.parameters.remove_item')}
          </button>
        </div>
        <div class="item-fields">
          {#each Object.entries(schema) as [key, field] (key)}
            <div class="field-item">
              <label class="field-label" for={`item-${index}-${key}`}
                >{resolveLabel(field, key)}</label
              >
              {#if field.type === 'integer'}
                <input
                  id={`item-${index}-${key}`}
                  type="number"
                  min={field.min}
                  max={field.max}
                  value={item[key]}
                  oninput={(e) => updateField(index, key, parseInt(e.currentTarget.value, 10))}
                />
              {:else if field.type === 'boolean'}
                <div class="checkbox-wrapper">
                  <input
                    id={`item-${index}-${key}`}
                    type="checkbox"
                    checked={item[key]}
                    onchange={(e) => updateField(index, key, e.currentTarget.checked)}
                  />
                  <span class="checkbox-custom"></span>
                </div>
              {:else}
                <input
                  id={`item-${index}-${key}`}
                  type="text"
                  value={item[key]}
                  oninput={(e) => updateField(index, key, e.currentTarget.value)}
                />
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="editor-actions">
    <Button variant="secondary" onclick={addItem} fullWidth>
      <span class="plus-icon">+</span>
      {$t('gallery.preview.parameters.add_item')}
    </Button>
  </div>
</div>

<style>
  .object-array-editor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .item-card {
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 8px;
    padding: 1rem;
    transition: all 0.2s ease;
  }

  .item-card:hover {
    border-color: rgba(59, 130, 246, 0.3);
    background: rgba(30, 41, 59, 0.6);
  }

  .item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  }

  .item-index {
    font-size: 0.75rem;
    font-weight: 600;
    color: #60a5fa;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .remove-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .remove-btn:hover {
    color: #f87171;
    background: rgba(248, 113, 113, 0.1);
  }

  .remove-icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .item-fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  .field-item {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field-label {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .field-item input[type='text'],
  .field-item input[type='number'] {
    padding: 0.5rem 0.75rem;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 0.85rem;
    transition: all 0.2s ease;
  }

  .field-item input:focus {
    outline: none;
    border-color: #3b82f6;
    background: rgba(15, 23, 42, 0.8);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .checkbox-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 34px;
  }

  .checkbox-wrapper input {
    width: 20px;
    height: 20px;
    cursor: pointer;
  }

  .plus-icon {
    font-size: 1.1rem;
    margin-right: 0.25rem;
  }

  .editor-actions {
    margin-top: 0.5rem;
  }
</style>
