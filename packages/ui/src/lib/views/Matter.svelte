<script lang="ts">
  import { t } from 'svelte-i18n';
  import type { BridgeInfo } from '../types';
  import Button from '../components/Button.svelte';

  let {
    bridgeInfo,
    infoLoading = false,
    onRefresh,
  }: {
    bridgeInfo: BridgeInfo | null;
    infoLoading?: boolean;
    onRefresh?: () => void;
  } = $props();

  // Find the Matter bridge config/status
  const matterBridge = $derived.by(() => {
    return bridgeInfo?.bridges?.find((b) => b.integrationType === 'matter') ?? null;
  });

  const commissioning = $derived(matterBridge?.commissioning ?? null);

  let copySuccess = $state<string | null>(null);
  let copyTimeout: ReturnType<typeof setTimeout>;
  let showPairingInfo = $state(false);

  function handleCopy(text: string, type: 'passcode' | 'manualCode' | 'discriminator') {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(text).then(() => {
      copySuccess = type;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copySuccess = null;
      }, 2000);
    });
  }
</script>

<div class="matter-view-container">
  <header class="view-header">
    <div class="header-text">
      <h2>{$t('matter.title', { default: 'Matter Integration' })}</h2>
      <p class="subtitle">
        {$t('matter.subtitle', { default: 'Manage Matter smart home connection details.' })}
      </p>
    </div>
    <div class="header-actions">
      <Button variant="outline-primary" onclick={onRefresh} isLoading={infoLoading}>
        {$t('common.refresh', { default: 'Refresh' })}
      </Button>
    </div>
  </header>

  {#if !matterBridge}
    <div class="status-card error-card">
      <p class="error-text">Matter integration is not active on any bridge.</p>
    </div>
  {:else if !commissioning}
    <div class="status-card loading-card">
      <p class="loading-text">Loading Matter configuration status...</p>
    </div>
  {:else}
    {#snippet brandIcon(label: string)}
      {#if label === 'Google Home'}
        <svg class="brand-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
            fill="#4285F4"
          />
          <path
            d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
            fill="#34A853"
          />
          <path
            d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.991 21.991 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
            fill="#FBBC05"
          />
          <path
            d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
            fill="#EA4335"
          />
        </svg>
      {:else if label === 'Apple Home'}
        <svg
          class="brand-icon"
          viewBox="0 0 41.5 51"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M40.2,17.4c-3.4,2.1-5.5,5.7-5.5,9.7c0,4.5,2.7,8.6,6.8,10.3c-0.8,2.6-2,5-3.5,7.2c-2.2,3.1-4.5,6.3-7.9,6.3s-4.4-2-8.4-2c-3.9,0-5.3,2.1-8.5,2.1s-5.4-2.9-7.9-6.5C2,39.5,0.1,33.7,0,27.6c0-9.9,6.4-15.2,12.8-15.2c3.4,0 6.2,2.2,8.3,2.2c2,0,5.2-2.3,9-2.3C34.1,12.2,37.9,14.1,40.2,17.4z M28.3,8.1C30,6.1,30.9,3.6,31,1c0-0.3,0-0.7-0.1-1c-2.9,0.3-5.6,1.7-7.5,3.9c-1.7,1.9-2.7,4.3-2.8,6.9c0,0.3,0,0.6,0.1,0.9c0.2,0,0.5,0.1,0.7,0.1C24.1,11.6,26.6,10.2,28.3,8.1z"
          />
        </svg>
      {:else if label === 'Samsung SmartThings'}
        <svg
          class="brand-icon brand-samsung"
          viewBox="0 0 544.8 83.4"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M20.7,22.6c-0.4-1.6-0.3-3.2-0.1-4.1c0.5-2.5,2.2-5.2,7.1-5.2c4.6,0,7.2,2.8,7.2,7.1c0,1.4,0,4.8,0,4.8h19.4v-5.5C54.4,2.7,39.1,0,28.1,0C14.3,0,3,4.6,0.9,17.3c-0.6,3.5-0.7,6.6,0.2,10.5c3.4,15.9,31.1,20.5,35.1,30.6c0.8,1.9,0.5,4.3,0.2,5.8c-0.6,2.6-2.4,5.3-7.6,5.3c-4.9,0-7.8-2.8-7.8-7.1l0-7.5H0v6c0,17.4,13.7,22.6,28.3,22.6c14.1,0,25.6-4.8,27.5-17.8c0.9-6.7,0.2-11-0.1-12.7C52.5,36.5,22.9,31.7,20.7,22.6z M274,22.7c-0.3-1.5-0.2-3.2-0.1-4c0.6-2.5,2.2-5.2,7.1-5.2c4.5,0,7.1,2.8,7.1,7c0,1.4,0,4.8,0,4.8h19.2v-5.4c0-16.8-15-19.4-25.9-19.4c-13.7,0-24.9,4.5-27,17.1c-0.5,3.4-0.7,6.5,0.2,10.4c3.3,15.7,30.7,20.3,34.7,30.3c0.7,1.9,0.5,4.3,0.1,5.7c-0.6,2.6-2.3,5.2-7.5,5.2c-4.8,0-7.8-2.8-7.8-7l0-7.5h-20.7v5.9c0,17.2,13.5,22.4,28,22.4c13.9,0,25.4-4.8,27.2-17.6c0.9-6.7,0.2-11-0.1-12.6C305.4,36.6,276.2,31.8,274,22.7z M450.8,65.2L432.5,2.5h-28.9v77.1h19.1l-1.1-64.7l19.7,64.7H469V2.5h-19.2L450.8,65.2z M83.4,2.5L68.9,80.4h21l10.9-72.1l10.6,72.1h20.9L118,2.5H83.4z M201,2.5l-9.8,60.9l-9.8-60.9h-31.8l-1.7,77.9h19.5l0.5-72.1l13.4,72.1H201l13.4-72.1l0.5,72.1h19.5l-1.7-77.9H201z M382,2.5h-19.7v57.6c0,1,0,2.1-0.2,3c-0.4,1.9-2,5.7-7.5,5.7c-5.4,0-7-3.7-7.4-5.7c-0.2-0.8-0.2-2-0.2-3V2.5h-19.7v55.8c0,1.4,0.1,4.4,0.2,5.1c1.4,14.5,12.8,19.3,27.1,19.3c14.3,0,25.8-4.7,27.2-19.3c0.1-0.8,0.3-3.7,0.2-5.1V2.5z M517.2,36.6V48h8v11.3c0,1,0,2.1-0.2,3c-0.3,2.1-2.3,5.7-8,5.7c-5.6,0-7.6-3.6-7.9-5.7c-0.1-0.9-0.2-2-0.2-3V23.7c0-1.3,0.1-2.6,0.4-3.7c0.4-1.9,2.1-5.6,7.7-5.6c6,0,7.4,3.9,7.8,5.6c0.2,1.1,0.2,3,0.2,3v4.3h19.6v-2.6c0,0,0.1-2.7-0.1-5.2C543,5,530.9,0.4,517.1,0.4c-13.8,0-25.6,4.7-27.3,19.2c-0.2,1.3-0.4,3.7-0.4,5.2v32.7c0,1.4,0,2.5,0.3,5.1c1.3,14.2,13.6,19.2,27.4,19.2c13.9,0,26.1-5,27.4-19.2c0.2-2.6,0.3-3.7,0.3-5.1V36.6H517.2z"
          />
        </svg>
      {:else if label === 'Amazon Alexa'}
        <svg
          class="brand-icon"
          viewBox="0 0 250 260"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g fill-rule="evenodd">
            <path
              d="m221.503 210.324c-105.235 50.083-170.545 8.18-212.352-17.271-2.587-1.604-6.984.375-3.169 4.757 13.928 16.888 59.573 57.593 119.153 57.593 59.621 0 95.09-32.532 99.527-38.207 4.407-5.627 1.294-8.731-3.16-6.872zm29.555-16.322c-2.826-3.68-17.184-4.366-26.22-3.256-9.05 1.078-22.634 6.609-21.453 9.93.606 1.244 1.843.686 8.06.127 6.234-.622 23.698-2.826 27.337 1.931 3.656 4.79-5.57 27.608-7.255 31.288-1.628 3.68.622 4.629 3.68 2.178 3.016-2.45 8.476-8.795 12.14-17.774 3.639-9.028 5.858-21.622 3.71-24.424z"
            />
            <path
              d="m150.744 108.13c0 13.141.332 24.1-6.31 35.77-5.361 9.489-13.853 15.324-23.341 15.324-12.952 0-20.495-9.868-20.495-24.432 0-28.75 25.76-33.968 50.146-33.968zm34.015 82.216c-2.23 1.992-5.456 2.135-7.97.806-11.196-9.298-13.189-13.615-19.356-22.487-18.502 18.882-31.596 24.527-55.601 24.527-28.37 0-50.478-17.506-50.478-52.565 0-27.373 14.85-46.018 35.96-55.126 18.313-8.066 43.884-9.489 63.43-11.718v-4.365c0-8.018.616-17.506-4.08-24.432-4.128-6.215-12.003-8.777-18.93-8.777-12.856 0-24.337 6.594-27.136 20.257-.57 3.037-2.799 6.026-5.835 6.168l-32.735-3.51c-2.751-.618-5.787-2.847-5.028-7.07 7.543-39.66 43.36-51.616 75.43-51.616 16.415 0 37.858 4.365 50.81 16.795 16.415 15.323 14.849 35.77 14.849 58.02v52.565c0 15.798 6.547 22.724 12.714 31.264 2.182 3.036 2.657 6.69-.095 8.966-6.879 5.74-19.119 16.415-25.855 22.393l-.095-.095"
            />
          </g>
        </svg>
      {:else if label === 'Home Assistant'}
        <svg
          class="brand-icon"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2L2 12h3v8h5v-6h4v6h5v-8h3L12 2zm-1 12H9v-2h2v2zm0-4H9V8h2v2zm4 4h-2v-2h2v2zm0-4h-2V8h2v2z"
          />
        </svg>
      {/if}
    {/snippet}

    <div class="grid-layout">
      <!-- Main Status Card -->
      <section class="info-card status-summary">
        <div class="card-header">
          <h3>{$t('matter.status', { default: 'Status' })}</h3>
        </div>
        <div class="card-content flex-row">
          <div class="status-badge-wrapper">
            {#if commissioning.isCommissioned}
              <div class="status-badge commissioned">
                <span class="badge-icon">✓</span>
                <span class="badge-label"
                  >{$t('matter.commissioned', { default: 'Commissioned' })}</span
                >
              </div>
              <Button
                variant="secondary"
                onclick={() => (showPairingInfo = !showPairingInfo)}
                class="show-pairing-btn"
              >
                {showPairingInfo
                  ? $t('matter.hide_pairing', { default: 'Hide Pairing Info' })
                  : $t('matter.show_pairing', { default: 'Show Pairing Info' })}
              </Button>
            {:else}
              <div class="status-badge waiting">
                <span class="badge-icon">⏳</span>
                <span class="badge-label"
                  >{$t('matter.not_commissioned', { default: 'Pairing Needed' })}</span
                >
              </div>
            {/if}
          </div>

          <div class="stats-box">
            <span class="stats-num">{commissioning.deviceCount ?? 0}</span>
            <span class="stats-label"
              >{$t('matter.device_count', { default: 'Shared Homenet Devices' })}</span
            >
          </div>
        </div>
      </section>

      <!-- Pairing Section -->
      {#if !commissioning.isCommissioned || showPairingInfo}
        <section class="info-card pairing-details">
          <div class="card-header">
            <h3>{$t('matter.pairing_info', { default: 'Pairing Credentials' })}</h3>
          </div>
          <div class="card-content qr-grid">
            <div class="qr-code-section">
              {#if commissioning.qrPairingCode}
                <div class="qr-frame">
                  <img
                    src="./api/qr?size=180&data={encodeURIComponent(commissioning.qrPairingCode)}"
                    alt={$t('matter.qr_code_aria', { default: 'Matter Pairing QR Code' })}
                    class="qr-image"
                  />
                </div>
                <p class="qr-tip">
                  {$t('matter.qr_scan_tip', { default: 'Scan QR code in smart home app to pair.' })}
                </p>
              {/if}
            </div>

            <div class="credentials-section">
              <div class="credential-item">
                <span class="label">{$t('matter.passcode', { default: 'Passcode' })}</span>
                <div class="value-box">
                  <code class="code-value">{commissioning.passcode}</code>
                  <button
                    type="button"
                    class="copy-btn"
                    onclick={() => handleCopy(String(commissioning.passcode), 'passcode')}
                    title="Copy Passcode"
                  >
                    {copySuccess === 'passcode' ? '✓' : '📋'}
                  </button>
                </div>
              </div>

              <div class="credential-item">
                <span class="label">{$t('matter.discriminator', { default: 'Discriminator' })}</span
                >
                <div class="value-box">
                  <code class="code-value">{commissioning.discriminator}</code>
                  <button
                    type="button"
                    class="copy-btn"
                    onclick={() => handleCopy(String(commissioning.discriminator), 'discriminator')}
                    title="Copy Discriminator"
                  >
                    {copySuccess === 'discriminator' ? '✓' : '📋'}
                  </button>
                </div>
              </div>

              <div class="credential-item full-width">
                <span class="label"
                  >{$t('matter.manual_code', { default: 'Manual Pairing Code' })}</span
                >
                <div class="value-box">
                  <code class="code-value">{commissioning.manualPairingCode}</code>
                  <button
                    type="button"
                    class="copy-btn"
                    onclick={() => handleCopy(commissioning.manualPairingCode, 'manualCode')}
                    title="Copy Manual Code"
                  >
                    {copySuccess === 'manualCode' ? '✓' : '📋'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      {/if}

      <!-- Fabrics Table Section -->
      <section class="info-card fabrics-section" class:full-span={commissioning.isCommissioned}>
        <div class="card-header">
          <h3>{$t('matter.fabrics', { default: 'Connected Platforms (Fabrics)' })}</h3>
        </div>
        <div class="card-content">
          {#if !commissioning.fabrics || commissioning.fabrics.length === 0}
            <div class="empty-fabrics">
              <span class="empty-icon">🔌</span>
              <p>{$t('matter.no_fabrics', { default: 'No connected platforms.' })}</p>
            </div>
          {:else}
            <div class="table-responsive">
              <table class="fabrics-table">
                <thead>
                  <tr>
                    <th>{$t('matter.fabric_index', { default: 'Index' })}</th>
                    <th>{$t('matter.label', { default: 'Label' })}</th>
                    <th>{$t('matter.vendor_id', { default: 'Vendor ID' })}</th>
                    <th>{$t('matter.fabric_id', { default: 'Fabric ID' })}</th>
                    <th>{$t('matter.node_id', { default: 'Node ID' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each commissioning.fabrics as fabric (fabric.fabricIndex)}
                    <tr class="fabric-row">
                      <td class="index-cell"><span class="idx-badge">{fabric.fabricIndex}</span></td
                      >
                      <td class="label-cell">
                        <span
                          class="platform-label"
                          class:custom={fabric.label !== 'Platform'}
                          class:google={fabric.label === 'Google Home'}
                          class:apple={fabric.label === 'Apple Home'}
                          class:smartthings={fabric.label === 'Samsung SmartThings'}
                          class:alexa={fabric.label === 'Amazon Alexa'}
                          class:homeassistant={fabric.label === 'Home Assistant'}
                          class:test={fabric.label === 'Test Platform'}
                        >
                          {@render brandIcon(fabric.label)}
                          {fabric.label || 'Platform'}
                        </span>
                      </td>
                      <td class="mono-cell">0x{fabric.vendorId.toString(16).toUpperCase()}</td>
                      <td class="mono-cell select-all" title={fabric.fabricId}>{fabric.fabricId}</td
                      >
                      <td class="mono-cell select-all" title={fabric.nodeId}>{fabric.nodeId}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .matter-view-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    color: #e2e8f0;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  }

  .view-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .view-header .subtitle {
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
    color: #94a3b8;
  }

  .grid-layout {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
  }

  /* Info Card styling */
  .info-card {
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 16px;
    padding: 1.5rem;
    backdrop-filter: blur(16px);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.25);
    transition:
      transform 0.2s,
      border-color 0.2s;
    min-width: 0;
  }

  .info-card:hover {
    border-color: rgba(148, 163, 184, 0.2);
  }

  .card-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #cbd5e1;
  }

  .card-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  /* Status summary card */
  .status-summary {
    grid-column: span 2;
  }

  .flex-row {
    flex-direction: row !important;
    align-items: center;
    justify-content: space-around;
    gap: 2rem;
    flex-wrap: wrap;
    padding: 0.5rem 0;
  }

  .status-badge-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  :global(.show-pairing-btn) {
    font-size: 0.8rem !important;
    padding: 0.35rem 0.75rem !important;
    border-radius: 8px !important;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.5rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 1.05rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    animation: badgePulse 3s infinite ease-in-out;
  }

  .status-badge.commissioned {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #34d399;
  }

  .status-badge.waiting {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
    color: #fbbf24;
  }

  .badge-icon {
    font-size: 1.25rem;
  }

  .stats-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .stats-num {
    font-size: 2.25rem;
    font-weight: 800;
    color: #6366f1;
    text-shadow: 0 0 20px rgba(99, 102, 241, 0.45);
  }

  .stats-label {
    font-size: 0.85rem;
    color: #94a3b8;
    font-weight: 500;
  }

  /* Pairing details section */
  .pairing-details {
    grid-column: span 1;
  }

  .qr-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
    align-items: center;
    justify-items: center;
  }

  @media (min-width: 900px) {
    .qr-grid {
      grid-template-columns: auto 1fr;
      align-items: flex-start;
      justify-items: start;
    }
  }

  .qr-code-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .qr-frame {
    background: #ffffff;
    padding: 0.75rem;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .qr-image {
    display: block;
    width: 150px;
    height: 150px;
    image-rendering: pixelated;
  }

  .qr-tip {
    font-size: 0.8rem;
    color: #94a3b8;
    text-align: center;
    max-width: 220px;
    line-height: 1.4;
  }

  .credentials-section {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    width: 100%;
  }

  .credential-item {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .credential-item.full-width {
    grid-column: span 2;
  }

  .credential-item .label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #64748b;
    letter-spacing: 0.03em;
  }

  .value-box {
    display: flex;
    align-items: center;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    position: relative;
    overflow: hidden;
  }

  .code-value {
    font-family: monospace;
    font-size: 0.95rem;
    color: #e2e8f0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    color: #94a3b8;
    padding: 0.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      color 0.15s,
      transform 0.1s;
  }

  .copy-btn:hover {
    color: #f1f5f9;
    transform: scale(1.1);
  }

  .copy-btn:active {
    transform: scale(0.95);
  }

  /* Fabrics section */
  .fabrics-section {
    grid-column: span 1;
  }

  .fabrics-section.full-span {
    grid-column: span 2;
  }

  .empty-fabrics {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    gap: 0.75rem;
    text-align: center;
    color: #64748b;
  }

  .empty-icon {
    font-size: 2rem;
  }

  .table-responsive {
    width: 100%;
    overflow-x: auto;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.1);
  }

  .fabrics-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .fabrics-table th {
    background: rgba(15, 23, 42, 0.5);
    padding: 0.75rem 1rem;
    font-weight: 600;
    color: #94a3b8;
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .fabrics-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    color: #cbd5e1;
  }

  .fabric-row:last-child td {
    border-bottom: none;
  }

  .idx-badge {
    background: rgba(99, 102, 241, 0.2);
    color: #818cf8;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.8rem;
  }

  :global(.brand-icon) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  :global(.brand-icon.brand-samsung) {
    width: 32px !important;
    height: auto !important;
  }

  .platform-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .platform-label.custom {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
  }

  .platform-label.google {
    background: rgba(244, 180, 0, 0.15);
    color: #f4b400;
  }

  .platform-label.apple {
    background: rgba(255, 149, 0, 0.15);
    color: #ff9500;
  }

  .platform-label.smartthings {
    background: rgba(3, 169, 244, 0.15);
    color: #03a9f4;
  }

  .platform-label.alexa {
    background: rgba(0, 202, 243, 0.15);
    color: #00caf3;
  }

  .platform-label.homeassistant {
    background: rgba(3, 155, 229, 0.15);
    color: #039be5;
  }

  .platform-label.test {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .mono-cell {
    font-family: monospace;
    font-size: 0.85rem;
  }

  .select-all {
    user-select: all;
  }

  /* Status States */
  .status-card {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    background: rgba(30, 41, 59, 0.3);
    border: 1px dashed rgba(148, 163, 184, 0.2);
    border-radius: 16px;
    text-align: center;
  }

  .error-card {
    border-color: rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }

  .loading-card {
    color: #94a3b8;
  }

  @keyframes badgePulse {
    0%,
    100% {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 4px 20px rgba(99, 102, 241, 0.15);
      transform: scale(1.02);
    }
  }

  /* Responsive styling */
  @media (max-width: 820px) {
    .grid-layout {
      grid-template-columns: 1fr;
    }

    .status-summary {
      grid-column: span 1;
    }

    .pairing-details,
    .fabrics-section {
      grid-column: span 1 !important;
    }
  }

  @media (max-width: 600px) {
    .view-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }

    .view-header .header-actions {
      width: 100%;
    }

    :global(.view-header .header-actions button) {
      width: 100% !important;
    }

    .flex-row {
      flex-direction: column !important;
      gap: 1.5rem;
      align-items: center;
      justify-content: center;
    }

    .credentials-section {
      grid-template-columns: 1fr;
    }

    .credential-item.full-width {
      grid-column: span 1;
    }
  }
</style>
