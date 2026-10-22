<script lang="ts">
  import { t } from 'svelte-i18n';
  import Button from './Button.svelte';
  import { UiAuthError, loginUi, setupUiPassword } from '../api/auth';

  let {
    mode,
    onSuccess,
  }: {
    mode: 'setup' | 'login';
    onSuccess: () => void;
  } = $props();

  const MIN_LENGTH = 8;
  const MAX_LENGTH = 1024;

  let password = $state('');
  let confirmPassword = $state('');
  let submitting = $state(false);
  let errorKey = $state<string | null>(null);

  function resolveErrorKey(err: unknown): string {
    if (err instanceof UiAuthError) {
      switch (err.code) {
        case 'INVALID_PASSWORD':
          return 'auth.errors.invalid_password';
        case 'INVALID_NEW_PASSWORD':
          return 'auth.errors.invalid_new_password';
        case 'RATE_LIMITED':
          return 'auth.errors.rate_limited';
        case 'UI_PASSWORD_ALREADY_CONFIGURED':
          return 'auth.errors.already_configured';
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

    if (mode === 'setup') {
      if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
        errorKey = 'auth.errors.password_length';
        return;
      }
      if (password !== confirmPassword) {
        errorKey = 'auth.errors.password_mismatch';
        return;
      }
    } else if (password.length === 0) {
      errorKey = 'auth.errors.invalid_password';
      return;
    }

    submitting = true;
    try {
      if (mode === 'setup') {
        await setupUiPassword(password);
      } else {
        await loginUi(password);
      }
      onSuccess();
    } catch (err) {
      errorKey = resolveErrorKey(err);
    } finally {
      submitting = false;
    }
  }
</script>

<div class="auth-gate">
  <div class="auth-card">
    <div class="brand">Homenet2MQTT</div>
    <h1>{mode === 'setup' ? $t('auth.setup.title') : $t('auth.login.title')}</h1>
    <p class="desc">
      {mode === 'setup' ? $t('auth.setup.desc') : $t('auth.login.desc')}
    </p>

    <form onsubmit={handleSubmit}>
      <label class="field">
        <span>{$t('auth.password')}</span>
        <input
          type="password"
          bind:value={password}
          autocomplete={mode === 'setup' ? 'new-password' : 'current-password'}
          disabled={submitting}
        />
      </label>

      {#if mode === 'setup'}
        <label class="field">
          <span>{$t('auth.confirm_password')}</span>
          <input
            type="password"
            bind:value={confirmPassword}
            autocomplete="new-password"
            disabled={submitting}
          />
        </label>
        <p class="hint">{$t('auth.setup.hint')}</p>
      {/if}

      {#if errorKey}
        <p class="error" role="alert">{$t(errorKey)}</p>
      {/if}

      <Button
        type="submit"
        variant="primary"
        fullWidth
        isLoading={submitting}
        disabled={submitting}
      >
        {mode === 'setup' ? $t('auth.submit_setup') : $t('auth.submit_login')}
      </Button>
    </form>
  </div>
</div>

<style>
  .auth-gate {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    box-sizing: border-box;
  }

  .auth-card {
    width: min(420px, 100%);
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 14px;
    padding: 2rem;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
    box-sizing: border-box;
  }

  .brand {
    color: #38bdf8;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.75rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #f1f5f9;
  }

  .desc {
    margin: 0.5rem 0 1.5rem;
    color: #94a3b8;
    font-size: 0.92rem;
    line-height: 1.5;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.88rem;
    color: #cbd5e1;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.65rem 0.75rem;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.3);
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

  .hint {
    margin: -0.35rem 0 0;
    color: #64748b;
    font-size: 0.8rem;
  }

  .error {
    margin: 0;
    color: #f87171;
    font-size: 0.85rem;
  }
</style>
