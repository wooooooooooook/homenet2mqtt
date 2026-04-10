<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  let {
    activeView = $bindable<'dashboard' | 'analysis' | 'gallery' | 'settings'>('dashboard'),
    isOpen = false,
    disabled = false,
    onClose,
  }: {
    activeView: 'dashboard' | 'analysis' | 'gallery' | 'settings';
    isOpen?: boolean;
    disabled?: boolean;
    onClose?: () => void;
  } = $props();

  function handleNavClick(view: typeof activeView) {
    activeView = view;
    onClose?.();
  }

  let showSponsorModal = $state(false);
  let isMobile = $state(false);
  const sponsorUrl = 'https://homenet2mqtt-docs.vercel.app/sponsor.html';
  const docsUrl = 'https://homenet2mqtt-docs.vercel.app/';

  onMount(() => {
    isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  });

  function handleSponsorClick() {
    if (isMobile) {
      showSponsorModal = true;
    } else {
      window.open(sponsorUrl, '_blank', 'noopener,noreferrer');
    }
  }
</script>

{#if isOpen}
  <button
    type="button"
    class="sidebar-backdrop"
    aria-label={$t('sidebar.close_aria')}
    onclick={() => onClose?.()}
  ></button>
{/if}

<aside class="sidebar" class:open={isOpen}>
  <nav class="nav-group">
    <button
      class="nav-item"
      class:active={activeView === 'dashboard'}
      aria-current={activeView === 'dashboard' ? 'page' : undefined}
      onclick={() => handleNavClick('dashboard')}
      {disabled}
    >
      <span class="icon" aria-hidden="true">📊</span>
      <span class="label">{$t('sidebar.dashboard')}</span>
    </button>
    <button
      class="nav-item"
      class:active={activeView === 'analysis'}
      aria-current={activeView === 'analysis' ? 'page' : undefined}
      onclick={() => handleNavClick('analysis')}
      {disabled}
    >
      <span class="icon" aria-hidden="true">📈</span>
      <span class="label">{$t('sidebar.analysis')}</span>
    </button>
    <button
      class="nav-item"
      class:active={activeView === 'gallery'}
      aria-current={activeView === 'gallery' ? 'page' : undefined}
      onclick={() => handleNavClick('gallery')}
      {disabled}
    >
      <span class="icon" aria-hidden="true">📦</span>
      <span class="label">{$t('sidebar.gallery')}</span>
    </button>
    <button
      class="nav-item"
      class:active={activeView === 'settings'}
      aria-current={activeView === 'settings' ? 'page' : undefined}
      onclick={() => handleNavClick('settings')}
      {disabled}
    >
      <span class="icon" aria-hidden="true">⚙️</span>
      <span class="label">{$t('sidebar.settings')}</span>
    </button>
  </nav>

  <nav class="nav-group bottom">
    <a
      class="nav-item"
      href={docsUrl}
      target="_blank"
      rel="noopener noreferrer"
      onclick={() => onClose?.()}
    >
      <span class="icon" aria-hidden="true">📚</span>
      <span class="label">{$t('sidebar.docs')}</span>
      <span class="external-link-icon" aria-hidden="true">↗</span>
    </a>
    <button type="button" class="nav-item" onclick={handleSponsorClick}>
      <span class="icon" aria-hidden="true">☕</span>
      <span class="label">{$t('sidebar.sponsor')}</span>
      {#if !isMobile}
        <span class="external-link-icon" aria-hidden="true">↗</span>
      {/if}
    </button>
  </nav>
</aside>

{#if showSponsorModal}
  <div
    class="sponsor-modal"
    role="button"
    tabindex="0"
    aria-label="모달 닫기"
    onclick={() => (showSponsorModal = false)}
    onkeydown={(e) => e.key === 'Escape' && (showSponsorModal = false)}
  >
    <div
      class="sponsor-modal-inner"
      role="dialog"
      aria-modal="true"
      aria-label="후원 QR코드"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        class="sponsor-modal-close"
        aria-label="닫기"
        onclick={() => (showSponsorModal = false)}>✕</button
      >
      <img src="./kakaopay-qr.png" alt="카카오페이 후원 QR코드" class="sponsor-modal-img" />
      <p class="sponsor-modal-label">
        <a
          href={sponsorUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="sponsor-modal-text-link"
          >homenet2mqtt 개발 후원하기 <span class="external-link-icon" aria-hidden="true">↗</span
          ></a
        >
      </p>
    </div>
  </div>
{/if}

<style>
  .sidebar {
    width: 250px;
    background: rgba(15, 23, 42, 0.95);
    border-right: 1px solid rgba(148, 163, 184, 0.1);
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    height: calc(100vh - 65px);
    box-sizing: border-box;
    position: fixed;
    left: 0;
    z-index: 50;
    transition: transform 0.3s ease-in-out;
    backdrop-filter: blur(12px);
  }

  .sidebar-backdrop {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 40;
    backdrop-filter: blur(2px);
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .nav-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .nav-group.bottom {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid rgba(148, 163, 184, 0.1);
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: #94a3b8;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: inherit;
    font-size: 0.95rem;
    outline: none;
    text-decoration: none;
  }

  .nav-item:hover {
    background: rgba(148, 163, 184, 0.1);
    color: #f8fafc;
    transform: translateX(4px);
  }

  .nav-item:focus-visible {
    background: rgba(148, 163, 184, 0.1);
    color: #f8fafc;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
  }

  .nav-item.active {
    background: rgba(37, 99, 235, 0.15);
    color: #3b82f6;
    font-weight: 600;
  }

  .nav-item:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    filter: grayscale(0.5);
  }

  .nav-item:disabled:hover {
    background: transparent;
    color: #94a3b8;
    transform: none;
  }

  .icon {
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  }

  .external-link-icon {
    margin-left: auto;
    font-size: 0.8em;
    opacity: 0.6;
  }

  @media (max-width: 768px) {
    .sidebar {
      transform: translateX(-100%);
    }

    .sidebar.open {
      transform: translateX(0);
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
    }

    .sidebar-backdrop {
      display: block;
    }
  }

  /* Modal */
  .sponsor-modal {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
    animation: sponsorFadeIn 0.3s ease;
  }

  .sponsor-modal-inner {
    position: relative;
    background: #1e293b;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 24px;
    padding: 32px 24px 24px;
    text-align: center;
    max-width: 340px;
    width: 90%;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    animation: sponsorSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .sponsor-modal-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: rgba(148, 163, 184, 0.1);
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    cursor: pointer;
    color: #94a3b8;
    transition: all 0.2s;
  }

  .sponsor-modal-close:hover {
    background: rgba(148, 163, 184, 0.2);
    color: #f1f5f9;
  }

  .sponsor-modal-img {
    width: 100%;
    max-width: 260px;
    height: auto;
    border-radius: 16px;
    display: block;
    margin: 0 auto 20px;
  }

  .sponsor-modal-label {
    margin: 0;
    font-size: 15px;
    font-weight: 500;
    color: #e2e8f0;
  }

  .sponsor-modal-text-link {
    color: inherit;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    background: rgba(59, 130, 246, 0.1);
    border-radius: 20px;
    color: #60a5fa;
    transition: all 0.2s;
  }

  .sponsor-modal-text-link:hover {
    background: rgba(59, 130, 246, 0.2);
    color: #93c5fd;
  }

  @keyframes sponsorFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes sponsorSlideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
</style>
