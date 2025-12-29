<script lang="ts">
  import SetupWizard from './SetupWizard.svelte';

  let { onclose } = $props<{ onclose: () => void }>();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onclose}>
  <div class="modal-content" onclick={(e) => e.stopPropagation()}>
    <button class="close-btn" onclick={onclose} aria-label="Close">×</button>
    <SetupWizard mode="add" />
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal-content {
    position: relative;
    width: 100%;
    max-width: 800px;
    max-height: 95vh;
    overflow-y: auto;
    padding: 1rem;
  }

  .close-btn {
    position: absolute;
    top: 2.5rem;
    right: 2.5rem;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid #475569;
    color: #e2e8f0;
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: rgba(30, 41, 59, 0.9);
    border-color: #94a3b8;
  }
</style>
