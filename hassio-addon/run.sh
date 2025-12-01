#!/bin/sh

# Parse options from /data/options.json
CONFIG_PATH=/data/options.json

export LOG_LEVEL=$(jq --raw-output '.log_level // "info"' $CONFIG_PATH)
export MQTT_URL=$(jq --raw-output '.mqtt_url // "mqtt://core-mosquitto:1883"' $CONFIG_PATH)
export MQTT_TOPIC_PREFIX=$(jq --raw-output '.mqtt_topic_prefix // "homenet"' $CONFIG_PATH)
export SERIAL_PORT=$(jq --raw-output '.serial_port // "/dev/ttyUSB0"' $CONFIG_PATH)
export CONFIG_FILE=$(jq --raw-output '.config_file // "samsung_sds.homenet_bridge.yaml"' $CONFIG_PATH)
export PORT=3000

echo "Starting homenet2mqtt..."
echo "Configuration:"
echo "  LOG_LEVEL: $LOG_LEVEL"
echo "  MQTT_URL: $MQTT_URL"
echo "  MQTT_TOPIC_PREFIX: $MQTT_TOPIC_PREFIX"
echo "  SERIAL_PORT: $SERIAL_PORT"
echo "  CONFIG_FILE: $CONFIG_FILE"

# Run the service
node packages/service/dist/server.js
