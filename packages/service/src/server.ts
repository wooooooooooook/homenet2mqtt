import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import mqtt from 'mqtt';
import { createBridge } from '@rs485-homenet/core';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const defaultMqttUrl = process.env.MQTT_URL ?? 'mqtt://mq:1883';

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/bridge/start', async (req, res, next) => {
  const { serialPath, baudRate = 9600, mqttUrl } = req.body ?? {};
  if (!serialPath) {
    res.status(400).json({ error: 'serialPath is required' });
    return;
  }

  const resolvedMqttUrl = resolveMqttUrl(mqttUrl);
  const bridge = createBridge({ serialPath, baudRate, mqttUrl: resolvedMqttUrl });
  try {
    await bridge.start();
    res.json({ status: 'started', mqttUrl: resolvedMqttUrl });
  } catch (err) {
    next(err);
  }
});

const resolveMqttUrl = (value: unknown) => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return defaultMqttUrl;
};

app.get('/api/packets/stream', (req, res) => {
  const streamMqttUrl = resolveMqttUrl(req.query.mqttUrl);

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
    client.subscribe('homenet/raw', (err) => {
      if (err) {
        sendStatus('error', { message: err.message });
        return;
      }

      sendStatus('subscribed', { topic: 'homenet/raw' });
    });
  });

  client.on('message', (topic, payload) => {
    const packet = {
      topic,
      payload: payload.toString('utf8'),
      payloadHex: payload.toString('hex'),
      payloadLength: payload.length,
      receivedAt: new Date().toISOString(),
    };

    sendEvent('packet', packet);
  });

  client.on('error', (err) => {
    sendStatus('error', { message: err.message });
  });

  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    client.end(true);
  });
});

const staticDir = path.resolve(__dirname, '../static');
app.use(express.static(staticDir));

app.get('*', (_req, res, next) => {
  const indexPath = path.join(staticDir, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      next();
    }
  });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[service] 요청 처리 중 오류:', err);
  if (res.headersSent) {
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal Server Error';
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`Service listening on port ${port}`);
});
