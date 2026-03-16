---
next:
  text: 'UI 설명'
  link: '/guide/getting-started'
---
# Docker 설치

> 이 섹션에서 무엇을 해결하나요?
>
> - Docker Compose로 Homenet2MQTT를 실행합니다.
> - 설정 파일 볼륨과 환경 변수를 연결합니다.
> - 실행 후 Web UI 접속을 검증합니다.

- 예상 소요 시간: **10~20분**
- 필수 준비물: Docker/Docker Compose, MQTT 브로커 정보
- 완료 기준:
  - 컨테이너 실행 상태 확인
  - Web UI 접속 성공
  - 설정 파일이 볼륨 경로에 저장됨

## docker-compose 예시

```yaml
services:
  homenet2mqtt:
    image: nubiz/homenet2mqtt:latest
    container_name: homenet2mqtt
    environment:
      CONFIG_FILES: default.homenet_bridge.yaml,
      MQTT_URL: mqtt://localhost:1883
      PORT: '3000'
      LOG_LEVEL: info
      TIMEZONE: ''
      # MQTT에 로그인 정보가 필요하다면 true로 설정하고 MQTT_USER, MQTT_PASSWD에 정보를 입력하세요.
      MQTT_NEED_LOGIN: 'false'
      MQTT_USER: ''
      MQTT_PASSWD: ''
      MQTT_TOPIC_PREFIX: homenet2mqtt
      # Homeassistant에서 기기가 자동으로 추가되게하려면 true로 설정.
      DISCOVERY_ENABLED: 'false'
    # USB RS485 장치를 사용하는경우 devices를 주석해제하여 사용하세요.
    # devices:
    #   - /dev/ttyUSB0:/dev/ttyUSB0
    volumes:
      - ./h2m-config:/config
    ports:
      - '3000:3000'
    restart: unless-stopped
```

> 환경변수 상세 설명은 [환경변수 레퍼런스](./environment-variables.md)를 참고하세요.

## 실행

```bash
docker compose up -d
```

- 브라우저에서 `http://<서버IP>:3000` 접속 후 설정 마법사를 진행합니다.
- 설정 파일은 `./h2m-config`에 저장됩니다.
