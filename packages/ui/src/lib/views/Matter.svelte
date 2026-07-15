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
      {#if !commissioning.isCommissioned}
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

  .platform-label {
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
</style>
