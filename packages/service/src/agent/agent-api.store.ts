import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@rs485-homenet/core';

export const DEFAULT_AGENT_API_PORT = 3001;
export const AGENT_TOKEN_DIGEST_LENGTH = 32;
export const AGENT_TOKEN_RANDOM_BYTES = 32;

export type AgentApiDisabledReason = 'env_disabled' | 'no_token' | 'store_unavailable' | null;

/**
 * Runtime view of the Agent API. Consumers must read through these getters so
 * token rotation and port changes apply without rebuilding the middleware.
 */
export interface AgentApiState {
  isEnvEnabled(): boolean;
  isReady(): boolean;
  hasToken(): boolean;
  unavailable(): boolean;
  getTokenHash(): Buffer | null;
  getAllowPacketSend(): boolean;
  getDesiredPort(): number;
  getActualPort(): number | null;
  disabledReason(): AgentApiDisabledReason;
}

interface AgentApiRecord {
  version: 1;
  mode: 'sha256';
  tokenHash: string | null;
  port: number;
  allowPacketSend: boolean;
  /** Set once the user completes the first-run Agent API screen while enabled. */
  setupAcked: boolean;
  /** Set once the user dismisses the "disabled by add-on option" guidance screen. */
  noticeAcked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentApiStoreOptions {
  envEnabled?: boolean;
  portRange?: { min: number; max: number };
}

const hashToken = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

function isValidPort(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function parseRecord(value: unknown, portMin: number, portMax: number): AgentApiRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<AgentApiRecord>;
  if (record.version !== 1 || record.mode !== 'sha256') return null;
  if (typeof record.allowPacketSend !== 'boolean') return null;
  if (record.setupAcked !== undefined && typeof record.setupAcked !== 'boolean') return null;
  if (record.noticeAcked !== undefined && typeof record.noticeAcked !== 'boolean') return null;
  if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') return null;
  if (!isValidPort(record.port, portMin, portMax)) return null;

  if (record.tokenHash !== null) {
    if (typeof record.tokenHash !== 'string') return null;
    const digest = Buffer.from(record.tokenHash, 'base64');
    if (digest.length !== AGENT_TOKEN_DIGEST_LENGTH) return null;
  }

  return {
    ...record,
    setupAcked: record.setupAcked ?? false,
    noticeAcked: record.noticeAcked ?? false,
  } as AgentApiRecord;
}

export class AgentApiStore implements AgentApiState {
  private record: AgentApiRecord | null = null;
  private unavailableState = false;
  private cachedHash: Buffer | null = null;
  private actualPort: number | null = null;
  private readonly envEnabled: boolean;
  private readonly portMin: number;
  private readonly portMax: number;

  constructor(
    private readonly filePath: string,
    options: AgentApiStoreOptions = {},
  ) {
    this.envEnabled = options.envEnabled ?? false;
    this.portMin = options.portRange?.min ?? 1;
    this.portMax = options.portRange?.max ?? 65535;
  }

  isEnvEnabled(): boolean {
    return this.envEnabled;
  }

  unavailable(): boolean {
    return this.unavailableState;
  }

  hasToken(): boolean {
    return this.record?.tokenHash != null;
  }

  isReady(): boolean {
    return this.envEnabled && !this.unavailableState && this.hasToken();
  }

  disabledReason(): AgentApiDisabledReason {
    if (!this.envEnabled) return 'env_disabled';
    if (this.unavailableState) return 'store_unavailable';
    if (!this.hasToken()) return 'no_token';
    return null;
  }

  getTokenHash(): Buffer | null {
    if (this.unavailableState || !this.record?.tokenHash) return null;
    if (!this.cachedHash) {
      this.cachedHash = Buffer.from(this.record.tokenHash, 'base64');
    }
    return this.cachedHash;
  }

  getAllowPacketSend(): boolean {
    return this.record?.allowPacketSend ?? false;
  }

  isSetupAcked(): boolean {
    return this.record?.setupAcked ?? false;
  }

  isNoticeAcked(): boolean {
    return this.record?.noticeAcked ?? false;
  }

  /**
   * The add-on has no first-run password screen, so the Agent API settings need
   * their own first-run screen: while enabled until the token exists, while
   * disabled until the "turn it on in the add-on options" guidance is dismissed.
   */
  isSetupPending(): boolean {
    if (this.unavailableState) return false;
    if (!this.envEnabled) return !this.isNoticeAcked();
    return !this.hasToken() && !this.isSetupAcked();
  }

  getDesiredPort(): number {
    return this.record?.port ?? DEFAULT_AGENT_API_PORT;
  }

  getActualPort(): number | null {
    return this.actualPort;
  }

  setActualPort(port: number | null): void {
    this.actualPort = port;
  }

  async load(): Promise<void> {
    this.record = null;
    this.cachedHash = null;
    this.unavailableState = false;

    let content: string;
    try {
      content = await fs.readFile(this.filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.unavailableState = true;
      logger.error(
        { err, filePath: this.filePath },
        '[agent-api] Failed to read agent API file. The Agent API stays disabled until the file is repaired or removed.',
      );
      return;
    }

    try {
      const parsed = parseRecord(JSON.parse(content), this.portMin, this.portMax);
      if (!parsed) throw new Error('Invalid agent API file structure');
      this.record = parsed;
    } catch (err) {
      this.unavailableState = true;
      this.record = null;
      logger.error(
        { err, filePath: this.filePath },
        '[agent-api] Failed to parse agent API file. The Agent API stays disabled until the file is repaired or removed.',
      );
    }
  }

  /** Generates a new token and returns its plaintext exactly once. */
  async generateToken(): Promise<string> {
    this.ensureWritable();
    const plaintext = randomBytes(AGENT_TOKEN_RANDOM_BYTES).toString('base64url');
    await this.persist({ tokenHash: hashToken(plaintext).toString('base64') });
    logger.info('[agent-api] Agent API token regenerated (value is not logged).');
    return plaintext;
  }

  async setPort(port: number): Promise<void> {
    this.ensureWritable();
    if (!isValidPort(port, this.portMin, this.portMax)) {
      throw new RangeError(
        `Agent API port must be an integer between ${this.portMin} and ${this.portMax}.`,
      );
    }
    await this.persist({ port });
  }

  async setAllowPacketSend(allow: boolean): Promise<void> {
    this.ensureWritable();
    await this.persist({ allowPacketSend: allow });
  }

  /**
   * Records that the user has already been shown the first-run Agent API screen.
   * The flag follows the current env state so enabling the option later surfaces
   * the settings screen again.
   */
  async ackFirstRun(): Promise<void> {
    this.ensureWritable();
    if (this.envEnabled) {
      if (!this.isSetupAcked()) await this.persist({ setupAcked: true });
      return;
    }
    if (!this.isNoticeAcked()) await this.persist({ noticeAcked: true });
  }

  private ensureWritable(): void {
    if (this.unavailableState) {
      throw new Error(
        'Agent API settings are unavailable because the agent API file is corrupted.',
      );
    }
  }

  private async persist(patch: Partial<AgentApiRecord>): Promise<void> {
    const now = new Date().toISOString();
    const base: AgentApiRecord = this.record ?? {
      version: 1,
      mode: 'sha256',
      tokenHash: null,
      port: DEFAULT_AGENT_API_PORT,
      allowPacketSend: false,
      setupAcked: false,
      noticeAcked: false,
      createdAt: now,
      updatedAt: now,
    };

    const record: AgentApiRecord = {
      ...base,
      version: 1,
      mode: 'sha256',
      ...patch,
      updatedAt: now,
    };

    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

    try {
      await fs.writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fs.chmod(tempPath, 0o600);
      await fs.rename(tempPath, this.filePath);
      await fs.chmod(this.filePath, 0o600);
    } catch (err) {
      await fs.unlink(tempPath).catch(() => undefined);
      throw err;
    }

    this.record = record;
    this.cachedHash = null;
    this.unavailableState = false;
  }
}
