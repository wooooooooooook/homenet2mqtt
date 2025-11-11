import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import mqtt from 'mqtt';
import yaml from 'js-yaml';
import { createBridge, HomeNetBridge, BridgeOptions } from '@rs485-homenet/core';

dotenv.config();

// --- Constants ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_DIR = path.resolve(__dirname, '../../core/config');

// --- Application State ---
const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

let bridge: HomeNetBridge | null = null;
let bridgeOptions: BridgeOptions | null = null;
let currentConfigFile: string | null = null;
let currentConfigContent: any | null = null;
let bridgeStatus: 'idle' | 'starting' | 'started' | 'stopped' | 'error' = 'idle';
let bridgeError: string | null = null;
let bridgeStartPromise: Promise<void> | null = null;

// --- Express Middleware & Setup ---
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '../static')));

// --- API Endpoints ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/bridge/info', (_req, res) => {
  if (!bridgeOptions) {
    return res.status(404).json({ error: 'Bridge not configured' });
  }
  res.json({
    configFile: currentConfigFile,
    serialPath: bridgeOptions.serialPath,
    baudRate: bridgeOptions.baudRate,
    mqttUrl: bridgeOptions.mqttUrl,
    status: bridgeStatus,
    error: bridgeError,
    topic: 'homenet/raw', // This might become dynamic later
  });
});

app.get('/api/configs', async (_req, res, next) => {
  try {
    const files = await fs.readdir(CONFIG_DIR);
    const yamlFiles = files.filter((file) => /\.ya?ml$/.test(file));
    res.json(yamlFiles);
  } catch (err) {
    next(err);
  }
});

app.get('/api/configs/current', (_req, res) => {
  if (!currentConfigFile) {
    return res.status(404).json({ error: 'No config loaded' });
  }
  res.json({
    file: currentConfigFile,
    content: currentConfigContent,
  });
});

app.post('/api/configs/select', async (req, res, next) => {
  const { file } = req.body;
  if (typeof file !== 'string') {
    return res.status(400).json({ error: 'Invalid file name' });
  }

  try {
    await loadAndStartBridge(file);
    res.json({ success: true, message: `Configuration '${file}' loaded.` });
  } catch (err) {
    next(err);
  }
});

app.get('/api/packets/stream', (req, res) => {
  const streamMqttUrl = resolveMqttUrl(req.query.mqttUrl, bridgeOptions?.mqttUrl);

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

  sendStatus('connecting', { mqttUrl: streamMqttUrl });

  const client = mqtt.connect(streamMqttUrl);

  client.on('connect', () => {
    sendStatus('connected', { mqttUrl: streamMqttUrl });
    client.subscribe('homenet/#', (err) => {
      if (err) {
        sendStatus('error', { message: err.message });
        return;
      }
      sendStatus('subscribed', { topic: 'homenet/#' });
    });
  });

  client.on('reconnect', () => sendStatus('connecting', { mqttUrl: streamMqttUrl }));
  client.on('error', (err) => sendStatus('error', { message: err.message }));
  client.on('close', () => sendStatus('error', { message: 'MQTT connection closed.' }));

  client.on('message', (topic, payload) => {
    sendEvent('mqtt-message', {
      topic,
      payload: payload.toString('utf8'),
      receivedAt: new Date().toISOString(),
    });
  });

  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    client.end(true);
  });
});

// --- Static Serving & Error Handling ---
app.get('*', (_req, res, next) => {
  res.sendFile(path.resolve(__dirname, '../static', 'index.html'), (err) => err && next());
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[service] Request error:', err);
  if (res.headersSent) return;
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  res.status(500).json({ error: message });
});

// --- Bridge Management ---
async function loadAndStartBridge(filename: string) {
  if (bridgeStartPromise) {
    await bridgeStartPromise.catch(() => {}); // Wait for any ongoing start/stop to finish
  }
  if (bridge) {
    console.log(`[service] Stopping existing bridge...`);
    bridgeStatus = 'stopped';
    await bridge.stop();
    bridge = null;
    console.log(`[service] Bridge stopped.`);
  }

  console.log(`[service] Loading configuration from '${filename}'...`);
  bridgeStatus = 'starting';
  bridgeError = null;

  try {
    const configPath = path.join(CONFIG_DIR, filename);
    const fileContent = await fs.readFile(configPath, 'utf8');
    const config = yaml.load(fileContent) as any;

    if (!config || !config.serial) {
      throw new Error('Invalid configuration file format.');
    }

    currentConfigFile = filename;
    currentConfigContent = config;

    const serialPath = process.env.SERIAL_PORT?.trim();
    if (!serialPath) {
      throw new Error('SERIAL_PORT 환경 변수가 설정되지 않았습니다.');
    }

    bridgeOptions = {
      serialPath,
      baudRate: config.serial.baud_rate || 9600,
      mqttUrl: process.env.MQTT_URL?.trim() || 'mqtt://mq:1883',
      devices: config.devices || [],
    };

    bridge = createBridge(bridgeOptions);

    bridgeStartPromise = bridge.start();
    await bridgeStartPromise;

    bridgeStatus = 'started';
    console.log(`[service] Bridge started successfully with '${filename}'.`);
  } catch (err) {
    bridgeStatus = 'error';
    bridgeError = err instanceof Error ? err.message : 'Unknown error during bridge start.';
    console.error(`[service] Failed to start bridge with '${filename}':`, err);
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
  console.log(`Service listening on port ${port}`);
  try {
    console.log('[service] Initializing bridge on startup...');
    const files = await fs.readdir(CONFIG_DIR);
    const defaultConfigFile = files.find((file) => /\.ya?ml$/.test(file));

    if (defaultConfigFile) {
      await loadAndStartBridge(defaultConfigFile);
    } else {
      throw new Error('No configuration files found in config directory.');
    }
  } catch (err) {
    console.error('[service] Initial bridge start failed:', err);
    bridgeStatus = 'error';
    bridgeError = err instanceof Error ? err.message : 'Initial start failed.';
  }
});
