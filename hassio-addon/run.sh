#!/bin/bash

# Home Assistant addon: options.json에서 설정을 읽어옴
# Docker container: 환경변수에서 설정을 읽어옴
CONFIG_PATH=/data/options.json

if [ -f "$CONFIG_PATH" ]; then
  # Home Assistant 애드온 환경
  echo "[run.sh] Running as Home Assistant addon"
  export LOG_LEVEL=$(jq --raw-output '.log_level // "info"' $CONFIG_PATH)
  export MQTT_URL=$(jq --raw-output '.mqtt_url // "mqtt://127.0.0.1:1883"' $CONFIG_PATH)
  export MQTT_NEED_LOGIN=$(jq --raw-output '.mqtt_need_login // false' $CONFIG_PATH)
  export MQTT_USER=$(jq --raw-output '.mqtt_user // ""' $CONFIG_PATH)
  export MQTT_PASSWD=$(jq --raw-output '.mqtt_passwd // ""' $CONFIG_PATH)
  export MQTT_TOPIC_PREFIX=$(jq --raw-output '.mqtt_topic_prefix // "homenet2mqtt"' $CONFIG_PATH)
  CONFIG_FILES=$(jq --raw-output '.config_files // [] | join(",")' $CONFIG_PATH)
  LEGACY_CONFIG_FILE=$(jq --raw-output '.config_file // ""' $CONFIG_PATH)
  
  if [ -z "$CONFIG_FILES" ] && [ -n "$LEGACY_CONFIG_FILE" ] && [ "$LEGACY_CONFIG_FILE" != "null" ]; then
    echo "[addon] config_file 설정을 config_files 배열로 옮겨주세요. 기존 값을 임시로 사용합니다."
    CONFIG_FILES="$LEGACY_CONFIG_FILE"
  fi
  
  if [ -z "$CONFIG_FILES" ] || [ "$CONFIG_FILES" == "null" ]; then
    CONFIG_FILES="default.homenet_bridge.yaml"
  fi
  
  export CONFIG_FILES="$CONFIG_FILES"
  
  # Home Assistant 경로 사용
  HA_CONFIG_DIR="/homeassistant/homenet2mqtt"
else
  # Docker 컨테이너 환경
  echo "[run.sh] Running as Docker container"
  export LOG_LEVEL="${LOG_LEVEL:-info}"
  export MQTT_URL="${MQTT_URL:-mqtt://localhost:1883}"
  export MQTT_NEED_LOGIN="${MQTT_NEED_LOGIN:-false}"
  export MQTT_USER="${MQTT_USER:-}"
  export MQTT_PASSWD="${MQTT_PASSWD:-}"
  export MQTT_TOPIC_PREFIX="${MQTT_TOPIC_PREFIX:-homenet2mqtt}"
  export CONFIG_FILES="${CONFIG_FILES:-default.homenet_bridge.yaml}"
  
  # CONFIG_ROOT 환경변수 또는 기본값 /config 사용
  HA_CONFIG_DIR="${CONFIG_ROOT:-/config}"
fi

export PORT="${PORT:-3000}"

IFS=',' read -r -a CONFIG_FILE_LIST <<< "$CONFIG_FILES"
export CONFIG_FILE="${CONFIG_FILE_LIST[0]}"

# Setup configuration directory
DEFAULT_CONFIG_DIR="packages/core/config"
INIT_MARKER="$HA_CONFIG_DIR/.initialized"
RESTART_FLAG="$HA_CONFIG_DIR/.restart-required"

if [ ! -d "$HA_CONFIG_DIR" ]; then
  echo "Creating configuration directory at $HA_CONFIG_DIR..."
  mkdir -p "$HA_CONFIG_DIR"
fi

if [ ! -f "$INIT_MARKER" ]; then
  echo "First run detected, seeding configuration files..."
  for file in "$DEFAULT_CONFIG_DIR"/*.yaml; do
    filename=$(basename "$file")
    echo "Copying default config $filename to $HA_CONFIG_DIR..."
    cp "$file" "$HA_CONFIG_DIR/"
  done
  if [ -d "$DEFAULT_CONFIG_DIR/examples" ]; then
    echo "Copying example configs to $HA_CONFIG_DIR/examples..."
    cp -r "$DEFAULT_CONFIG_DIR/examples" "$HA_CONFIG_DIR/"
  fi
  touch "$INIT_MARKER"
  echo "기본 및 예제 설정파일이 $HA_CONFIG_DIR 에 복사되었습니다."
  
  # Docker 컨테이너 환경에서는 종료하지 않고 계속 진행
  if [ -f "$CONFIG_PATH" ]; then
    echo "알맞은 설정파일을 검토 및 수정한 뒤 애드온 설정에서 config_files를 지정 하고 애드온을 다시 시작해주세요."
    exit 0
  else
    echo "알맞은 설정파일을 검토 및 수정한 뒤 CONFIG_FILES 환경변수를 지정하고 컨테이너를 다시 시작해주세요."
    echo "또는 기본 설정파일 ($CONFIG_FILES)로 시작합니다..."
  fi
fi

export CONFIG_ROOT="$HA_CONFIG_DIR"

# Check if default.homenet_bridge.yaml exists, create if not
DEFAULT_CONFIG_FILE="$HA_CONFIG_DIR/default.homenet_bridge.yaml"
if [ ! -f "$DEFAULT_CONFIG_FILE" ]; then
  echo "Creating default configuration file at $DEFAULT_CONFIG_FILE..."
  cat > "$DEFAULT_CONFIG_FILE" << 'EOF'
# RS485 HomeNet to MQTT Bridge Configuration
# 이 파일은 기본 설정 템플릿입니다.
# examples 폴더의 샘플을 참고하여 설정을 수정하세요.
#
# 설정 가이드:
# - serial.path: RS485 장치 경로 (예: /dev/ttyUSB0, 192.168.0.1:8888)
# - serial.baud_rate: 통신 속도 (기본값: 9600)
# - packet_defaults: 패킷 형식 설정 (헤더, 푸터, 체크섬 등)
# - light, switch, climate 등: 기기 설정

homenet_bridge:
  serial:
    portId: main
    path: /dev/ttyUSB0
    baud_rate: 9600
    data_bits: 8
    parity: NONE
    stop_bits: 1

  packet_defaults:
    rx_timeout: 10ms
    tx_delay: 50ms
    tx_timeout: 500ms
    tx_retry_cnt: 3

# 기기 설정은 examples 폴더의 샘플을 참고하세요.
# 예: examples/kocom.homenet_bridge.yaml, examples/commax.homenet_bridge.yaml 등
EOF
fi

echo "Starting homenet2mqtt..."
echo "Configuration:"
echo "  LOG_LEVEL: $LOG_LEVEL"
echo "  MQTT_URL: $MQTT_URL"
echo "  CONFIG_FILES: $CONFIG_FILES"
echo "  CONFIG_ROOT: $CONFIG_ROOT"
echo "  MQTT_NEED_LOGIN: $MQTT_NEED_LOGIN"
echo "  MQTT_USER: $MQTT_USER"
echo "  MQTT_TOPIC_PREFIX: $MQTT_TOPIC_PREFIX"

# Run the service with restart flag support for initialization flow
while true; do
  node packages/service/dist/server.js
  exit_code=$?

  if [ $exit_code -eq 0 ] && [ -f "$RESTART_FLAG" ]; then
    echo "[addon] Restart flag detected. Re-launching service to apply selected default config..."
    rm -f "$RESTART_FLAG"
    continue
  fi

  exit $exit_code
done
