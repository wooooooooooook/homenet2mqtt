// packages/core/src/transports/mqtt/publisher.ts
import { MqttClient as InternalMqttClient } from './mqtt.client.js'; // To get the internal client
import { logger } from '../../utils/logger.js';

export class MqttPublisher {
  private mqttClient: InternalMqttClient;

  constructor(mqttClient: InternalMqttClient) {
    this.mqttClient = mqttClient;
  }

  public publish(topic: string, payload: string | Buffer, options?: { retain: boolean }): void {
    this.mqttClient.client.publish(topic, payload, options, (err) => {
      if (err) {
        logger.error({ err, topic, payload: payload.toString() }, '[mqtt-publisher] Failed to publish MQTT message');
      } else {
        logger.debug({ topic, payload: payload.toString() }, '[mqtt-publisher] Published MQTT message');
      }
    });
  }
}
