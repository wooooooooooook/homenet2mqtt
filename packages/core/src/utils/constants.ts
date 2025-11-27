/**
 * MQTT topic prefix - configurable via MQTT_TOPIC_PREFIX environment variable
 * Default: "homenet"
 */
export const MQTT_TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'homenet';
