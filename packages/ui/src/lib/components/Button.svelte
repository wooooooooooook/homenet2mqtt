<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'primary',
    disabled = false,
    isLoading = false,
    type = 'button',
    ariaLabel,
    class: className = '',
    children,
    onclick,
  } = $props<{
    variant?: 'primary' | 'danger' | 'secondary';
    disabled?: boolean;
    isLoading?: boolean;
    type?: 'button' | 'submit' | 'reset';
    ariaLabel?: string;
    class?: string;
    children?: Snippet;
    onclick?: (e: MouseEvent) => void;
  }>();
</script>

<button
  class={`btn ${variant} ${className}`}
  class:loading={isLoading}
  {type}
  {onclick}
  disabled={disabled || isLoading}
  aria-label={ariaLabel}
  aria-busy={isLoading}
>
  {#if isLoading}
    <span class="spinner" aria-hidden="true"></span>
  {/if}
  <span class="content" class:invisible={isLoading}>
    {@render children?.()}
  </span>
</button>

<style>
  .btn {
    position: relative;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    border: none;
    cursor: pointer;
    font-weight: bold;
    color: white;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .btn:active:not(:disabled) {
    transform: translateY(1px);
  }

  .primary {
    background-color: #007bff;
  }

  .primary:hover:not(:disabled) {
    background-color: #0056b3;
  }

  .danger {
    background-color: #dc3545;
  }

  .danger:hover:not(:disabled) {
    background-color: #bd2130;
  }

  .secondary {
    background: transparent;
    color: #94a3b8;
    border: 1px solid #475569;
  }

  .secondary:hover:not(:disabled) {
    background: #334155;
    color: white;
    border-color: #334155;
  }

  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .btn:focus-visible {
    outline: 2px solid white;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.5);
  }

  /* Spinner */
  .spinner {
    position: absolute;
    width: 1em;
    height: 1em;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: currentColor;
    animation: spin 0.8s linear infinite;
  }

  .content.invisible {
    opacity: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
