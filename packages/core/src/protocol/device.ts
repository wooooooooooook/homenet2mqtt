import { matchesPacket } from '../utils/packet-matching.js';
import {
  DeviceConfig,
  StateSchema,
  StateNumSchema,
  ProtocolConfig,
  CommandResult,
} from './types.js';
import { Buffer } from 'buffer';
import { extractFromSchema } from './schema-utils.js';
import type { EntityErrorEvent, EntityErrorType } from '../service/event-bus.js';
import { CelExecutor, CompiledScript, ReusableBufferView } from './cel-executor.js';
import { logger } from '../utils/logger.js';
import { hasExplicitSchemaIndex } from './schema-index.js';

export abstract class Device {
  public config: DeviceConfig;
  protected protocolConfig: ProtocolConfig;
  protected state: Record<string, any> = {};
  private errorReporter?: (payload: EntityErrorEvent) => void;
  private lastError: { type: EntityErrorType; timestamp: number } | null = null;
  protected preparedGuard: CompiledScript | null = null;
  protected reusableBufferView: ReusableBufferView | null = null;
  protected reusableContext: Record<string, any>;

  constructor(config: DeviceConfig, protocolConfig: ProtocolConfig) {
    this.config = config;
    this.protocolConfig = protocolConfig;

    const executor = CelExecutor.shared();
    this.reusableBufferView = executor.createReusableBufferView();
    this.reusableContext = {
      x: 0n,
      xstr: '',
      data: this.reusableBufferView.proxy,
      len: 0n,
      state: {},
      states: {},
      trigger: {},
      args: {},
    };

    if (this.config.state?.guard) {
      try {
        this.preparedGuard = executor.prepare(this.config.state.guard);
      } catch (err) {
        logger.warn(
          { err, guard: this.config.state.guard },
          '[Device] Failed to prepare guard script',
        );
      }
    }
  }

  public abstract parseData(packet: Buffer): Record<string, any> | null;

  public abstract constructCommand(
    commandName: string,
    value?: any,
    states?: Map<string, Record<string, any>>,
  ): number[] | CommandResult | null;

  public getOptimisticState(_commandName: string, _value?: any): Record<string, any> | null {
    return null;
  }

  public getId(): string {
    return this.config.id;
  }

  public getName(): string {
    return this.config.name;
  }

  public getState(): Record<string, any> {
    return this.state;
  }

  public setErrorReporter(reporter?: (payload: EntityErrorEvent) => void): void {
    this.errorReporter = reporter;
  }

  public getLastError(): { type: EntityErrorType; timestamp: number } | null {
    return this.lastError;
  }

  protected reportError(payload: Omit<EntityErrorEvent, 'entityId' | 'timestamp'>): void {
    const timestamp = new Date().toISOString();
    this.lastError = { type: payload.type, timestamp: Date.parse(timestamp) };
    this.errorReporter?.({
      entityId: this.config.id,
      timestamp,
      ...payload,
    });
  }

  protected updateState(newState: Record<string, any>) {
    this.state = { ...this.state, ...newState };
  }

  public reset(): void {
    this.state = {};
    this.lastError = null;
  }

  // Helper to extract data based on schema
  protected extractFromSchema(packet: Buffer, schema: StateSchema | StateNumSchema): any {
    return extractFromSchema(packet, schema);
  }

  public matchesPacket(packet: Buffer): boolean {
    const stateConfig = this.config.state;
    if (!stateConfig || !stateConfig.data) {
      // If no state config, we can't match based on state pattern.
      // However, some devices might be command-only or use other matching.
      // But for the purpose of "state update", we usually need a match.
      // Let's return false to be safe, preventing random updates.
      return false;
    }

    // offset이 명시되지 않은 경우에만 headerLength를 baseOffset으로 사용
    // offset이 명시된 경우(0 포함)는 헤더 포함 전체 패킷 기준
    const headerLength = this.protocolConfig.packet_defaults?.rx_header?.length || 0;
    const baseOffset = hasExplicitSchemaIndex(stateConfig) ? 0 : headerLength;

    // Optimization: Update reusable view/context for zero-allocation guard execution
    if (this.reusableBufferView) {
      this.reusableBufferView.update(packet, 0, packet.length);
      this.reusableContext.len = BigInt(packet.length);
      this.reusableContext.state = this.getState();
      // Reset other context fields if needed, but for guard, typically only data/len/state are used
    }

    return matchesPacket(stateConfig, packet, {
      baseOffset,
      context: { state: this.getState() },
      preparedGuard: this.preparedGuard,
      reusableContext: this.reusableContext,
    });
  }
}
