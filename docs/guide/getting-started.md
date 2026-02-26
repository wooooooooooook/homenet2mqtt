# 시작하기

Homenet2MQTT는 Home Assistant 애드온 또는 Docker 컨테이너로 실행할 수 있습니다.

## 1. Home Assistant 애드온 (권장)

가장 간편한 설치 방법입니다.

1. **애드온 저장소 추가**: Home Assistant의 `설정` > `애드온` > `애드온 스토어` > 우측 상단 `점 세개(...)` > `저장소`에 아래 주소를 추가합니다.
   - `https://github.com/wooooooooooook/HAaddons`
2. **H2M 애드온 설치**: 목록에서 `Homenet2MQTT`를 찾아 설치한 후 **실행**합니다.
3. **초기 설정 마법사**: 애드온 상단의 `WEB UI 열기` 버튼을 클릭하여 설정 마법사를 통해 월패드 종류를 선택합니다. 제조사 목록에서 **빈 설정파일로 시작**을 선택하면 serial 파라미터를 직접 입력할 수 있습니다.
4. **갤러리 확인**: web ui에서 갤러리로 들어가서 집에 맞는 설정들을 적용합니다.
5. **재시작**: 설정을 마친 후 애드온을 재시작하면 기기들이 자동으로 Home Assistant에 등록됩니다.

---

## 2. Docker / Docker Compose

직접 서버를 운영하거나 Docker 환경을 선호하는 경우입니다.

1. docker compose 파일을 작성합니다.

   ```yaml
   services:
     homenet2mqtt:
       image: nubiz/homenet2mqtt:latest
       container_name: homenet2mqtt
       environment:
         # 설정 파일 목록 (쉼표로 구분)
         CONFIG_FILES: default.homenet_bridge.yaml,
         # MQTT 브로커 URL
         MQTT_URL: mqtt://localhost:1883
         # 웹 UI 포트
         PORT: '3000'
         # 로그 레벨 (debug, info, warn, error)
         LOG_LEVEL: info
         # 타임존 (비워두면 서버는 UTC, 프론트는 브라우저 설정)
         TIMEZONE: ''
         # MQTT 인증 설정
         MQTT_NEED_LOGIN: 'false'
         MQTT_USER: ''
         MQTT_PASSWD: ''
         MQTT_TOPIC_PREFIX: homenet2mqtt
         # HA discovery 사용 여부 (기본값: false)
         # Home Assistant와 연동하려면 'true'로 설정
         DISCOVERY_ENABLED: 'false'
       volumes:
         # 설정 파일 볼륨
         - ./h2m-config:/config
       # 시리얼 포트 장치 (USB serial 장치를 사용하는 경우 주석 해제)
       # devices:
       #   - /dev/ttyUSB0:/dev/ttyUSB0
       ports:
         - '3000:3000'
       restart: unless-stopped
   ```

2. 아래 명령어로 서비스를 시작합니다.
   ```bash
   docker-compose up -d
   ```
3. `http://서버IP:3000` 접속 후 설정 마법사를 통해 설정을 완료합니다. 필요하면 **빈 설정파일로 시작**을 선택해 serial 항목을 직접 입력할 수 있습니다.
4. 설정 파일은 `./h2m-config` 디렉토리에 저장됩니다.

## 💡 고급 사용법

### 멀티 포트(Multi-port) 사용하기

- 여러 개의 RS485 포트를 사용하는 경우, `homenet2mqtt` 폴더 내에 각각의 설정 파일을 생성합니다 (예: `livingroom.yaml`, `room1.yaml`).
- 각 파일의 `serial.path`에 해당 장치 경로를 입력하고, `serial.portId`가 중복되지 않도록 설정합니다.
- 애드온 구성(또는 Docker 환경 변수)의 `CONFIG_FILES`에 파일 이름들을 쉼표로 구분하여 입력한 후 재시작합니다.

- [Config 작성법 (상세 스키마)](../config/index.md)
