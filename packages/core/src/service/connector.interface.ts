import { HomenetBridgeConfig } from '../config/types.js';
import { StateChangedEvent } from './event-bus.js';
import { PacketProcessor, EntityStateProvider } from '../protocol/packet-processor.js';
import { CommandManager } from './command.manager.js';
import { AutomationManager } from '../automation/automation-manager.js';
import { StateManager } from '../state/state-manager.js';

export interface ConnectorContext {
  portId: string;
  config: HomenetBridgeConfig;
  packetProcessor: PacketProcessor;
  commandManager: CommandManager;
  automationManager: AutomationManager;
  stateProvider: EntityStateProvider;
  stateManager: StateManager;
  executeCommand(
    entityId: string,
    commandName: string,
    value?: number | string,
  ): Promise<{ success: boolean; packet?: string; error?: string }>;
}

export interface IntegrationConnector {
  name: string;
  initialize(context: ConnectorContext): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  onStateChanged?(event: StateChangedEvent): void;
  isConnected?(): boolean;
  clearRetainedMessages?(): Promise<number>;
  clearRetainedMessagesForEntity?(entityId: string): Promise<number>;
  revokeDevice?(entityId: string): void | Promise<void>;
}
