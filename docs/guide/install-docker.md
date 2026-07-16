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
## Matter 연동 모드 기동 시 중요 주의사항 (Network Mode)

Matter 프로토콜은 스마트홈 플랫폼(스마트싱스, 홈킷, 구글홈 등)의 로컬 기기 검색을 위해 **mDNS (멀티캐스트 DNS, UDP 5353)** 프로토콜을 사용합니다. Docker의 기본 브릿지 네트워크 모드(`ports:` 포워딩) 환경에서는 이 멀티캐스트 패킷이 중계되지 않아 외부 스마트홈 컨트롤러가 브릿지 기기를 발견할 수 없습니다.

따라서 **`INTEGRATION_TYPE=matter`**로 구동하는 컨테이너는 반드시 네트워크 모드를 **`network_mode: host`** (또는 Docker CLI 실행 시 `--net=host`)로 실행해야 합니다.
```
### Matter용 docker-compose 예시
```yaml
services:
  homenet2matter:
    image: nubiz/homenet2mqtt:latest
    container_name: homenet2matter
    network_mode: host            # Matter mDNS 탐색 및 페어링 연결을 위해 필수적입니다.
    privileged: true
    environment:
      INTEGRATION_TYPE: matter    # Matter 모드로 실행
      CONFIG_FILES: default.homenet_bridge.yaml,
      PORT: '3000'                # Web UI 포트
      LOG_LEVEL: info
      TIMEZONE: 'Asia/Seoul'
    # USB RS485 장치를 사용하는경우 아래 주석을 풀고 기기에 맞게 입력하세요.
    # devices:
    #   - /dev/ttyUSB0:/dev/ttyUSB0
    volumes:
      - ./h2m-config:/config
    restart: unless-stopped
```

> 환경변수 상세 설명은 [환경변수 레퍼런스](./environment-variables.md)를 참고하세요.

## 실행

```bash
docker compose up -d
```

- 브라우저에서 `http://<서버IP>:3000` 접속 후 설정 마법사를 진행합니다.
- 설정 파일은 `./h2m-config`에 저장됩니다.
