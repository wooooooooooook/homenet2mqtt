<script lang="ts">
  import { t } from 'svelte-i18n';
  import type { UnifiedEntity } from '../types';

  let {
    entities,
    onSelect,
  }: {
    entities: UnifiedEntity[];
    onSelect: (entityId: string, portId: string | undefined, category: any) => void;
  } = $props();

  let searchQuery = $state('');
  let sortBy = $state<'name' | 'id' | 'type' | 'status'>('name');
  let sortOrder = $state<'asc' | 'desc'>('asc');

  function handleSort(column: typeof sortBy) {
    if (sortBy === column) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = column;
      sortOrder = 'asc';
    }
  }

  const filteredAndSortedEntities = $derived.by(() => {
    let result = [...entities];

    // 1. Filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.displayName.toLowerCase().includes(query) ||
          e.id.toLowerCase().includes(query) ||
          (e.description && e.description.toLowerCase().includes(query)) ||
          (e.category && e.category.toLowerCase().includes(query)),
      );
    }

    // 2. Sort
    result.sort((a, b) => {
      if (sortBy === 'status') {
        const valA = a.isActive ? 1 : 0;
        const valB = b.isActive ? 1 : 0;
        const comparison = valA - valB;
        return sortOrder === 'asc' ? comparison : -comparison;
      }

      let valA = '';
      let valB = '';

      if (sortBy === 'name') {
        valA = a.displayName || '';
        valB = b.displayName || '';
      } else if (sortBy === 'id') {
        valA = a.id || '';
        valB = b.id || '';
      } else if (sortBy === 'type') {
        valA = a.category || '';
        valB = b.category || '';
      }

      const comparison = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  });
</script>

<div class="automations-container">
  <header class="automations-header">
    <div class="header-text">
      <h1>{$t('automations.title')}</h1>
      <p class="subtitle">{$t('automations.subtitle')}</p>
    </div>
    <div class="search-bar">
      <span class="search-icon" aria-hidden="true">🔍</span>
      <input
        type="text"
        placeholder={$t('automations.search_placeholder')}
        bind:value={searchQuery}
        aria-label={$t('automations.search_placeholder')}
      />
      {#if searchQuery}
        <button
          type="button"
          class="clear-btn"
          onclick={() => (searchQuery = '')}
          aria-label="clear"
        >
          ✕
        </button>
      {/if}
    </div>
  </header>

  <div class="table-wrapper">
    <table class="automations-table">
      <thead>
        <tr>
          <th
            class="status-col sortable"
            onclick={() => handleSort('status')}
            role="columnheader"
            aria-sort={sortBy === 'status'
              ? sortOrder === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none'}
          >
            <div class="header-cell">
              {$t('automations.status')}
              <span
                class="sort-icon"
                class:active={sortBy === 'status'}
                class:desc={sortBy === 'status' && sortOrder === 'desc'}
              >
                ▲
              </span>
            </div>
          </th>
          <th
            class="sortable"
            onclick={() => handleSort('name')}
            role="columnheader"
            aria-sort={sortBy === 'name'
              ? sortOrder === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none'}
          >
            <div class="header-cell">
              {$t('automations.name')}
              <span
                class="sort-icon"
                class:active={sortBy === 'name'}
                class:desc={sortBy === 'name' && sortOrder === 'desc'}
              >
                ▲
              </span>
            </div>
          </th>
          <th
            class="sortable"
            onclick={() => handleSort('id')}
            role="columnheader"
            aria-sort={sortBy === 'id'
              ? sortOrder === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none'}
          >
            <div class="header-cell">
              {$t('automations.id')}
              <span
                class="sort-icon"
                class:active={sortBy === 'id'}
                class:desc={sortBy === 'id' && sortOrder === 'desc'}
              >
                ▲
              </span>
            </div>
          </th>
          <th
            class="sortable"
            onclick={() => handleSort('type')}
            role="columnheader"
            aria-sort={sortBy === 'type'
              ? sortOrder === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none'}
          >
            <div class="header-cell">
              {$t('automations.type')}
              <span
                class="sort-icon"
                class:active={sortBy === 'type'}
                class:desc={sortBy === 'type' && sortOrder === 'desc'}
              >
                ▲
              </span>
            </div>
          </th>
          <th>{$t('automations.description')}</th>
          <th>{$t('automations.port')}</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredAndSortedEntities as entity (entity.category + ':' + (entity.portId || '') + ':' + entity.id)}
          {@const isActive = entity.isActive ?? entity.enabled !== false}
          <tr
            class="automation-row"
            onclick={() => onSelect(entity.id, entity.portId, entity.category)}
          >
            <td class="status-col">
              <span class="status-badge" class:active={isActive}>
                <span class="status-dot"></span>
                {isActive ? $t('automations.active') : $t('automations.inactive')}
              </span>
            </td>
            <td class="name-cell font-semibold">{entity.displayName}</td>
            <td class="id-cell font-mono">{entity.id}</td>
            <td class="type-cell">
              <span class="type-badge {entity.category}">
                {$t(`entity_types.${entity.category}`, { default: entity.category || 'unknown' })}
              </span>
            </td>
            <td class="desc-cell text-slate-400">{entity.description || '-'}</td>
            <td class="port-cell font-mono">{entity.portId || '-'}</td>
          </tr>
        {:else}
          <tr>
            <td colspan="6" class="empty-cell">
              <div class="empty-state">
                <span class="empty-icon" aria-hidden="true">⚡</span>
                <p>{$t('automations.no_items')}</p>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .automations-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    height: 100%;
    box-sizing: border-box;
  }

  .automations-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .header-text h1 {
    font-size: 1.8rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    color: #f8fafc;
    background: linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .subtitle {
    font-size: 0.95rem;
    color: #94a3b8;
    margin: 0;
  }

  .search-bar {
    position: relative;
    display: flex;
    align-items: center;
    background: #1e293b;
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 12px;
    padding: 0.5rem 1rem;
    width: 320px;
    max-width: 100%;
    box-sizing: border-box;
    transition: all 0.2s ease;
  }

  .search-bar:focus-within {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  }

  .search-icon {
    font-size: 0.9rem;
    color: #64748b;
    margin-right: 0.5rem;
  }

  .search-bar input {
    background: transparent;
    border: none;
    outline: none;
    color: #f8fafc;
    font-size: 0.9rem;
    width: 100%;
    font-family: inherit;
  }

  .clear-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    transition: background 0.2s;
  }

  .clear-btn:hover {
    background: rgba(148, 163, 184, 0.1);
    color: #f8fafc;
  }

  .table-wrapper {
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 16px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    backdrop-filter: blur(12px);
  }

  .automations-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.95rem;
  }

  .automations-table th,
  .automations-table td {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.05);
    white-space: nowrap;
  }

  .automations-table th {
    background: rgba(15, 23, 42, 0.3);
    color: #94a3b8;
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    user-select: none;
  }

  .automations-table th.sortable {
    cursor: pointer;
    transition: color 0.2s;
  }

  .automations-table th.sortable:hover {
    color: #f8fafc;
  }

  .header-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .sort-icon {
    font-size: 0.6rem;
    transition:
      transform 0.2s,
      opacity 0.2s;
    opacity: 0;
  }

  .sortable:hover .sort-icon {
    opacity: 0.5;
  }

  .sort-icon.active {
    opacity: 1;
    color: #3b82f6;
  }

  .sort-icon.desc {
    transform: rotate(180deg);
  }

  .automation-row {
    cursor: pointer;
    transition:
      background-color 0.2s,
      transform 0.1s;
  }

  .automation-row:hover {
    background-color: rgba(148, 163, 184, 0.04);
  }

  .automation-row:active {
    transform: scale(0.995);
  }

  .status-col {
    width: 110px;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.6rem;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 600;
    background: rgba(100, 116, 139, 0.15);
    color: #94a3b8;
    transition: all 0.2s ease;
    user-select: none;
  }

  .status-badge.active {
    background: rgba(16, 185, 129, 0.1);
    color: #34d399;
  }

  .status-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #94a3b8;
  }

  .status-badge.active .status-dot {
    background-color: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
  }

  .font-semibold {
    font-weight: 600;
    color: #e2e8f0;
  }

  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.85rem;
    color: #cbd5e1;
  }

  .type-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.6rem;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 500;
    background: rgba(148, 163, 184, 0.1);
    color: #94a3b8;
  }

  .type-badge.automation {
    background: rgba(139, 92, 246, 0.1);
    color: #a78bfa;
  }

  .type-badge.script {
    background: rgba(6, 182, 212, 0.1);
    color: #22d3ee;
  }

  .desc-cell {
    color: #94a3b8;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty-cell {
    padding: 4rem 1.25rem;
    text-align: center;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    color: #64748b;
  }

  .empty-icon {
    font-size: 2.5rem;
    opacity: 0.5;
  }

  @media (max-width: 640px) {
    .automations-header {
      flex-direction: column;
      align-items: stretch;
    }

    .search-bar {
      width: 100%;
    }
  }
</style>
