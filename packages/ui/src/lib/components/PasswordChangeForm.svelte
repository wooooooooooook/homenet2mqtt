<script lang="ts">
  import { t } from 'svelte-i18n';
  import Button from './Button.svelte';
  import { UiAuthError, changeUiPassword } from '../api/auth';

  let {
    passwordConfigured = false,
    onChanged,
  }: {
    passwordConfigured?: boolean;
    onChanged?: () => void;
  } = $props();

  const MIN_LENGTH = 8;
  const MAX_LENGTH = 1024;

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let submitting = $state(false);
  let errorKey = $state<string | null>(null);
  let success = $state(false);

  function resolveErrorKey(err: unknown): string {
    if (err instanceof UiAuthError) {
      switch (err.code) {
        case 'INVALID_PASSWORD':
          return 'auth.errors.invalid_current_password';
        case 'INVALID_NEW_PASSWORD':
          return 'auth.errors.invalid_new_password';
        case 'RATE_LIMITED':
          return 'auth.errors.rate_limited';
        case 'NETWORK_ERROR':
          return 'auth.errors.network';
        default:
          return 'auth.errors.unknown';
      }
    }
    return 'auth.errors.unknown';
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    errorKey = null;
    success = false;

    if (passwordConfigured && currentPassword.length === 0) {
      errorKey = 'auth.errors.invalid_current_password';
      return;
    }
    if (newPassword.length < MIN_LENGTH || newPassword.length > MAX_LENGTH) {
      errorKey = 'auth.errors.password_length';
      return;
    }
    if (newPassword !== confirmPassword) {
      errorKey = 'auth.errors.password_mismatch';
      return;
    }

    submitting = true;
    try {
      await changeUiPassword(passwordConfigured ? currentPassword : undefined, newPassword);
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      success = true;
      onChanged?.();
    } catch (err) {
      errorKey = resolveErrorKey(err);
    } finally {
      submitting = false;
    }
  }
</script>

<form class="password-form" onsubmit={handleSubmit}>
  {#if passwordConfigured}
    <label class="field">
      <span>{$t('auth.current_password')}</span>
      <input
        type="password"
        bind:value={currentPassword}
        autocomplete="current-password"
        disabled={submitting}
      />
    </label>
  {/if}

  <div class="field-row">
    <label class="field">
      <span>{$t('auth.new_password')}</span>
      <input
        type="password"
        bind:value={newPassword}
        autocomplete="new-password"
        disabled={submitting}
      />
    </label>
    <label class="field">
      <span>{$t('auth.confirm_password')}</span>
      <input
        type="password"
        bind:value={confirmPassword}
        autocomplete="new-password"
        disabled={submitting}
      />
    </label>
  </div>

  {#if errorKey}
    <p class="error" role="alert">{$t(errorKey)}</p>
  {/if}
  {#if success}
    <p class="success" role="status">{$t('auth.password_changed')}</p>
  {/if}

  <div class="actions">
    <Button type="submit" variant="primary" isLoading={submitting} disabled={submitting}>
      {$t('auth.submit_change')}
    </Button>
  </div>
</form>

<style>
  .password-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: #cbd5e1;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.6);
    color: #e2e8f0;
    font-size: 0.95rem;
    font-family: inherit;
  }

  input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
  }

  input:disabled {
    opacity: 0.6;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .error {
    margin: 0;
    color: #f87171;
    font-size: 0.85rem;
  }

  .success {
    margin: 0;
    color: #34d399;
    font-size: 0.85rem;
  }

  @media (max-width: 720px) {
    .field-row {
      grid-template-columns: 1fr;
    }
  }
</style>
