<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  let {
    activeView = $bindable<'dashboard' | 'analysis' | 'gallery' | 'settings'>('dashboard'),
    isOpen = false,
    onClose,
  }: {
    activeView: 'dashboard' | 'analysis' | 'gallery' | 'settings';
    isOpen?: boolean;
    onClose?: () => void;
  } = $props();

  function handleNavClick(view: typeof activeView) {
    activeView = view;
    onClose?.();
  }

  let showSponsorModal = $state(false);
  let isMobile = $state(false);

  onMount(() => {
    isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  });

  function handleSponsorClick() {
    if (isMobile) {
      window.open('https://qr.kakaopay.com/Ej7qgjcVK', '_blank', 'noopener,noreferrer');
    } else {
      showSponsorModal = true;
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
  <nav>
    <button
      class="nav-item"
      class:active={activeView === 'dashboard'}
      aria-current={activeView === 'dashboard' ? 'page' : undefined}
      onclick={() => handleNavClick('dashboard')}
    >
      <span class="icon" aria-hidden="true">📊</span>
      <span class="label">{$t('sidebar.dashboard')}</span>
    </button>
    <button
      class="nav-item"
      class:active={activeView === 'analysis'}
      aria-current={activeView === 'analysis' ? 'page' : undefined}
      onclick={() => handleNavClick('analysis')}
    >
      <span class="icon" aria-hidden="true">📈</span>
      <span class="label">{$t('sidebar.analysis')}</span>
    </button>
    <button
      class="nav-item"
      class:active={activeView === 'gallery'}
      aria-current={activeView === 'gallery' ? 'page' : undefined}
      onclick={() => handleNavClick('gallery')}
    >
      <span class="icon" aria-hidden="true">📦</span>
      <span class="label">{$t('sidebar.gallery')}</span>
    </button>
    <button
      class="nav-item"
      class:active={activeView === 'settings'}
      aria-current={activeView === 'settings' ? 'page' : undefined}
      onclick={() => handleNavClick('settings')}
    >
      <span class="icon" aria-hidden="true">⚙️</span>
      <span class="label">{$t('sidebar.settings')}</span>
    </button>
  </nav>

  <div class="sponsor-panel">
    <p class="sponsor-title">☕ 개발자 후원하기</p>
    <p class="sponsor-desc">카카오페이로 후원해 주세요</p>
    <button type="button" class="sponsor-qr-btn" onclick={handleSponsorClick} aria-label="후원하기">
      <img src="./kakaopay-qr.png" alt="카카오페이 후원 QR코드" class="sponsor-qr" />
    </button>
    <p class="sponsor-hint">{isMobile ? '탭하여 후원' : '클릭하면 크게 볼 수 있어요'}</p>
  </div>
</aside>

{#if showSponsorModal}
  <div
    class="sponsor-modal"
    role="dialog"
    aria-modal="true"
    aria-label="후원 QR코드"
    onclick={() => (showSponsorModal = false)}
  >
    <div class="sponsor-modal-inner" onclick={(e) => e.stopPropagation()}>
      <button
        type="button"
        class="sponsor-modal-close"
        aria-label="닫기"
        onclick={() => (showSponsorModal = false)}>✕</button
      >
      <img src="./kakaopay-qr.png" alt="카카오페이 후원 QR코드" class="sponsor-modal-img" />
      <p class="sponsor-modal-label">homenet2mqtt 개발자 후원하기</p>
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

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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
    transition: all 0.2s;
    font-family: inherit;
    font-size: 0.95rem;
    outline: none;
  }

  .nav-item:hover {
    background: rgba(148, 163, 184, 0.1);
    color: #e2e8f0;
  }

  .nav-item:focus-visible {
    background: rgba(148, 163, 184, 0.1);
    color: #e2e8f0;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
  }

  .nav-item.active {
    background: rgba(37, 99, 235, 0.1);
    color: #3b82f6;
    font-weight: 600;
  }

  .icon {
    font-size: 1.2rem;
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

  /* Sponsor panel */
  .sponsor-panel {
    margin-top: auto;
    padding-top: 20px;
    text-align: center;
    border-top: 1px solid rgba(148, 163, 184, 0.12);
  }

  .sponsor-title {
    margin: 0 0 2px;
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .sponsor-desc {
    margin: 0 0 10px;
    font-size: 11px;
    color: #64748b;
  }

  .sponsor-qr-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: block;
    margin: 0 auto 6px;
    border-radius: 8px;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
  }

  .sponsor-qr-btn:hover {
    transform: scale(1.04);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  }

  .sponsor-qr {
    width: 140px;
    height: 140px;
    object-fit: cover;
    border-radius: 8px;
    display: block;
  }

  .sponsor-hint {
    margin: 0;
    font-size: 10px;
    color: #475569;
  }

  /* Modal */
  .sponsor-modal {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(6px);
    animation: sponsorFadeIn 0.2s ease;
  }

  .sponsor-modal-inner {
    position: relative;
    background: #1e293b;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 16px;
    padding: 28px 24px 20px;
    text-align: center;
    max-width: 340px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    animation: sponsorSlideUp 0.2s ease;
  }

  .sponsor-modal-close {
    position: absolute;
    top: 12px;
    right: 14px;
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    color: #64748b;
    line-height: 1;
    padding: 4px;
    transition: color 0.15s;
  }

  .sponsor-modal-close:hover {
    color: #e2e8f0;
  }

  .sponsor-modal-img {
    width: 100%;
    max-width: 260px;
    height: auto;
    border-radius: 12px;
    display: block;
    margin: 0 auto 12px;
  }

  .sponsor-modal-label {
    margin: 0 0 14px;
    font-size: 14px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .sponsor-modal-link {
    display: inline-block;
    padding: 9px 20px;
    border-radius: 8px;
    background: #fee500;
    color: #1a1a1a;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .sponsor-modal-link:hover {
    opacity: 0.85;
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
      transform: translateY(16px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
</style>
