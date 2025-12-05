import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import yaml, { Type, Schema } from 'js-yaml';
// Import only createBridge and HomeNetBridge, BridgeOptions is now defined in core
// Import only createBridge and HomeNetBridge, BridgeOptions is now defined in core
import {
  createBridge,
  HomeNetBridge,
  HomenetBridgeConfig,
  logger,
  eventBus,
  LambdaConfig,
} from '@rs485-homenet/core';
import { PacketCache } from './cache.js';

// Define a custom YAML type for !lambda
const LambdaType = new Type('!lambda', {
  kind: 'scalar',
  construct: (data: string): LambdaConfig => {
    return { type: 'lambda', script: data };
  },
});

// Create a schema that includes the custom LambdaType
const HOMENET_BRIDGE_SCHEMA = yaml.DEFAULT_SCHEMA.extend([LambdaType]);

dotenv.config();

// --- Constants ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_DIR = process.env.CONFIG_ROOT || path.resolve(__dirname, '../../core/config');

// --- Application State ---
const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

let bridge: HomeNetBridge | null = null;
// bridgeOptions will now be derived from the loaded HomenetBridgeConfig
let currentConfigFile: string | null = null;
let currentConfigContent: HomenetBridgeConfig | null = null; // Type changed to HomenetBridgeConfig
let bridgeStatus: 'idle' | 'starting' | 'started' | 'stopped' | 'error' = 'idle';
let bridgeError: string | null = null;
let bridgeStartPromise: Promise<void> | null = null;

// --- Cache Initialization ---
const packetCache = new PacketCache(eventBus);

// --- Express Middleware & Setup ---
app.use(express.json());

// --- API Endpoints ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/bridge/info', async (_req, res) => {
  // If a startup is in progress, tell the client to wait.
  if (bridgeStartPromise) {
    return res.status(503).json({ error: 'Bridge is starting...' });
  }

  if (!currentConfigContent) {
    return res.json({
      configFile: currentConfigFile || 'N/A',
      serialPath: process.env.SERIAL_PORT || '/simshare/rs485-sim-tty',
      baudRate: 0,
      mqttUrl: process.env.MQTT_URL?.trim() || 'mqtt://mq:1883',
      status: 'error',
      error: bridgeError || '브리지가 설정되지 않았거나 시작에 실패했습니다.',
      topic: 'homenet/raw',
    });
  }
  res.json({
    configFile: currentConfigFile,
    serialPath: process.env.SERIAL_PORT || '/simshare/rs485-sim-tty', // Serial path is now from env or default
    baudRate: currentConfigContent.serial.baud_rate, // From new config structure
    mqttUrl: process.env.MQTT_URL?.trim() || 'mqtt://mq:1883',
    status: bridgeStatus,
    error: bridgeError,
    topic: 'homenet/raw', // This might become dynamic later
  });
});

app.get('/api/packets/stream', (req, res) => {
  const streamMqttUrl = resolveMqttUrl(
    req.query.mqttUrl,
    process.env.MQTT_URL?.trim() || 'mqtt://mq:1883',
  );

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event: string, payload: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const sendStatus = (state: string, extra: Record<string, unknown> = {}) => {
    sendEvent('status', { state, ...extra });
  };

  // Since we are using core's connection, we assume it's connected or will connect.
  // We can't easily track the exact connection state of core's mqtt client here without more events from core.
  // For now, we'll send a 'connected' status to satisfy the UI.
  sendStatus('connected', { mqttUrl: streamMqttUrl });

  // Send cached data
  const initialState = packetCache.getInitialState();

  initialState.mqttState.forEach((msg) => {
    sendEvent('mqtt-message', msg);
  });

  initialState.rawPackets.forEach((packet) => {
    sendEvent('raw-data-with-interval', packet);
  });

  initialState.commandPackets.forEach((packet) => {
    sendEvent('command-packet', packet);
  });

  if (initialState.packetStats) {
    sendEvent('packet-interval-stats', initialState.packetStats);
  }

  // Listen for raw data from the event bus
  const handleRawData = (data: string) => {
    sendEvent('raw-data', {
      topic: 'homenet/raw', // Mimic MQTT topic for consistency with UI
      payload: data,
      receivedAt: new Date().toISOString(),
    });
  };
  eventBus.on('raw-data', handleRawData);

  const handleRawDataWithInterval = (data: unknown) => {
    sendEvent('raw-data-with-interval', data);
  };
  eventBus.on('raw-data-with-interval', handleRawDataWithInterval);

  const handlePacketIntervalStats = (data: unknown) => {
    sendEvent('packet-interval-stats', data);
  };
  eventBus.on('packet-interval-stats', handlePacketIntervalStats);

  // Listen for command packets from the event bus
  const handleCommandPacket = (data: unknown) => {
    sendEvent('command-packet', data);
  };
  eventBus.on('command-packet', handleCommandPacket);

  // Listen for MQTT messages from the event bus (emitted by core's subscriber and publisher)
  const handleMqttMessage = (data: { topic: string; payload: string }) => {
    // logger.debug({ topic: data.topic }, '[service] MQTT message received via eventBus');
    sendEvent('mqtt-message', {
      topic: data.topic,
      payload: data.payload,
      receivedAt: new Date().toISOString(),
    });
  };
  eventBus.on('mqtt-message', handleMqttMessage);

  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.off('raw-data', handleRawData);
    eventBus.off('raw-data-with-interval', handleRawDataWithInterval);
    eventBus.off('packet-interval-stats', handlePacketIntervalStats);
    eventBus.off('command-packet', handleCommandPacket);
    eventBus.off('mqtt-message', handleMqttMessage);
  });
});

// --- Command API Endpoints ---
interface CommandInfo {
  entityId: string;
  entityName: string;
  entityType: string;
  commandName: string;
  displayName: string;
  inputType?: 'number' | 'text';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

function extractCommands(config: HomenetBridgeConfig): CommandInfo[] {
  const commands: CommandInfo[] = [];

  // All entity types (same as discovery-manager)
  const entityTypeKeys: (keyof HomenetBridgeConfig)[] = [
    'light',
    'climate',
    'valve',
    'button',
    'sensor',
    'fan',
    'switch',
    'lock',
    'number',
    'select',
    'text_sensor',
    'text',
    'binary_sensor',
  ];

  for (const entityType of entityTypeKeys) {
    const entities = config[entityType] as Array<Record<string, unknown>> | undefined;
    if (!entities) continue;

    for (const entity of entities) {
      const entityId = entity.id as string;
      const entityName = entity.name as string || entityId;

      // Dynamically find all command_* properties in the entity
      for (const key of Object.keys(entity)) {
        if (!key.startsWith('command_')) continue;

        const commandData = entity[key];
        if (!commandData) continue;

        const commandSuffix = key.replace('command_', '');
        const displayCommandName = commandSuffix.charAt(0).toUpperCase() + commandSuffix.slice(1);

        const cmdInfo: CommandInfo = {
          entityId,
          entityName,
          entityType,
          commandName: key,
          displayName: `${entityName} ${displayCommandName}`,
        };

        // Detect input types based on command name and entity type
        if (key === 'command_temperature' || key === 'command_speed' || key === 'command_brightness' || key === 'command_percentage' || key === 'command_position') {
          cmdInfo.inputType = 'number';

          // Get visual config for temperature bounds (climate)
          const visual = entity.visual as { min_temperature?: string; max_temperature?: string; temperature_step?: string } | undefined;
          if (visual && key === 'command_temperature') {
            const parseTemp = (val?: string) => val ? parseInt(val.replace(/[^\d]/g, '')) : undefined;
            cmdInfo.min = parseTemp(visual.min_temperature) ?? 5;
            cmdInfo.max = parseTemp(visual.max_temperature) ?? 40;
            cmdInfo.step = parseTemp(visual.temperature_step) ?? 1;
          } else if (key === 'command_brightness') {
            cmdInfo.min = 0;
            cmdInfo.max = 255;
            cmdInfo.step = 1;
          } else if (key === 'command_percentage' || key === 'command_speed' || key === 'command_position') {
            cmdInfo.min = 0;
            cmdInfo.max = 100;
            cmdInfo.step = 1;
          }
        }

        // Number entity
        if (entityType === 'number' && key === 'command_number') {
          cmdInfo.inputType = 'number';
          cmdInfo.min = entity.min_value as number ?? 0;
          cmdInfo.max = entity.max_value as number ?? 100;
          cmdInfo.step = entity.step as number ?? 1;
        }

        // Select entity
        if (entityType === 'select' && key === 'command_option') {
          cmdInfo.inputType = 'text';
          cmdInfo.options = entity.options as string[] ?? [];
        }

        // Text entity
        if (entityType === 'text' && key === 'command_text') {
          cmdInfo.inputType = 'text';
        }

        commands.push(cmdInfo);
      }
    }
  }

  return commands;
}

app.get('/api/commands', (_req, res) => {
  if (!currentConfigContent) {
    return res.status(400).json({ error: 'Config not loaded' });
  }

  const commands = extractCommands(currentConfigContent);
  res.json({ commands });
});

app.post('/api/commands/execute', async (req, res) => {
  const { entityId, commandName, value } = req.body as {
    entityId?: string;
    commandName?: string;
    value?: number | string;
  };

  if (!entityId || !commandName) {
    return res.status(400).json({ error: 'entityId and commandName are required' });
  }

  if (!bridge) {
    return res.status(400).json({ error: 'Bridge not started' });
  }

  // Convert command_on -> on, command_off -> off, etc.
  const cmdName = commandName.replace('command_', '');

  const result = await bridge.executeCommand(entityId, cmdName, value);

  if (result.success) {
    res.json({
      success: true,
      entityId,
      commandName: cmdName,
      value,
      packet: result.packet,
    });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// --- Static Serving & Error Handling ---
// Serve static files AFTER API routes to prevent API requests from being served as static files
app.use(
  express.static(path.resolve(__dirname, '../static'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      }
    },
  }),
);

// Fallback to index.html for SPA routing (must be AFTER static files and API routes)
app.get('*', (_req, res, next) => {
  res.sendFile(path.resolve(__dirname, '../static', 'index.html'), (err) => err && next());
});

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, '[service] Request error');
    if (res.headersSent) return;
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    res.status(500).json({ error: message });
  },
);

// --- Bridge Management ---
async function loadAndStartBridge(filename: string) {
  if (bridgeStartPromise) {
    await bridgeStartPromise.catch(() => { }); // Wait for any ongoing start/stop to finish
  }
  if (bridge) {
    logger.info('[service] Stopping existing bridge...');
    bridgeStatus = 'stopped';
    await bridge.stop();
    bridge = null;
    logger.info('[service] Bridge stopped.');
  }

  logger.info(`[service] Loading configuration from '${filename}'...`);
  bridgeStatus = 'starting';
  bridgeError = null;

  try {
    const configPath = path.join(CONFIG_DIR, filename);
    const fileContent = await fs.readFile(configPath, 'utf8');
    const loadedYaml = yaml.load(fileContent, { schema: HOMENET_BRIDGE_SCHEMA }) as {
      homenet_bridge: HomenetBridgeConfig;
    };

    if (!loadedYaml || !loadedYaml.homenet_bridge) {
      throw new Error('Invalid configuration file format. Missing "homenet_bridge" top-level key.');
    }

    currentConfigFile = filename;
    currentConfigContent = loadedYaml.homenet_bridge; // Store the actual homenet_bridge config

    const mqttUrl = process.env.MQTT_URL?.trim() || 'mqtt://mq:1883';
    const mqttUsername = process.env.MQTT_USER?.trim() || undefined;
    const mqttPassword = process.env.MQTT_PASSWD?.trim() || undefined;

    // createBridge now expects configPath, mqttUrl, and optional credentials
    bridge = await createBridge(configPath, mqttUrl, mqttUsername, mqttPassword);

    bridgeStatus = 'started';
    logger.info(`[service] Bridge started successfully with '${filename}'.`);
  } catch (err) {
    bridgeStatus = 'error';
    bridgeError = err instanceof Error ? err.message : 'Unknown error during bridge start.';
    logger.error({ err }, `[service] Failed to start bridge with '${filename}'`);
    // Don't re-throw, let the caller handle the status
  } finally {
    bridgeStartPromise = null;
  }
}

function resolveMqttUrl(queryValue: unknown, defaultValue?: string) {
  const url = queryValue || defaultValue || 'mqtt://mq:1883';
  return url.toString().trim();
}

// --- Server Initialization ---
app.listen(port, async () => {
  logger.info(`Service listening on port ${port}`);
  try {
    logger.info('[service] Initializing bridge on startup...');
    if (process.env.CONFIG_FILE) {
      logger.info(
        `[service] Loading configuration from environment variable: ${process.env.CONFIG_FILE}`,
      );
      // Extract filename from path if needed, or just pass the path if loadAndStartBridge handles it.
      // loadAndStartBridge expects a filename relative to CONFIG_DIR.
      // If CONFIG_FILE is a full path like 'packages/core/config/samsung_sds.homenet_bridge.yaml',
      // we need to handle that.
      // However, looking at loadAndStartBridge: const configPath = path.join(CONFIG_DIR, filename);
      // So we should pass just the basename if it's in the config dir.

      const configBasename = path.basename(process.env.CONFIG_FILE);
      await loadAndStartBridge(configBasename);
    } else {
      const files = await fs.readdir(CONFIG_DIR);
      // Filter for homenet_bridge.yaml files
      const defaultConfigFile = files.find((file) => /\.homenet_bridge\.ya?ml$/.test(file));

      if (defaultConfigFile) {
        await loadAndStartBridge(defaultConfigFile);
      } else {
        throw new Error('No homenet_bridge configuration files found in config directory.');
      }
    }
  } catch (err) {
    logger.error({ err }, '[service] Initial bridge start failed');
    bridgeStatus = 'error';
    bridgeError = err instanceof Error ? err.message : 'Initial start failed.';
  }
});
