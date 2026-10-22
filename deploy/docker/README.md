# Docker 배포 가이드

Docker Hub의 `nubiz/homenet2mqtt` 이미지를 사용하여 빌드 없이 바로 배포할 수 있습니다.

## 빠른 시작

1. 아래 `docker-compose.yml`을 원하는 디렉토리에 저장합니다.
2. `./h2m-config` 폴더를 생성하고 설정 파일을 넣습니다.
3. `docker compose up -d` 실행

```yaml
services:
  homenet2mqtt:
    image: nubiz/homenet2mqtt:latest
    container_name: homenet2mqtt
    environment:
      MQTT_URL: mqtt://localhost:1883
      PORT: '3000'
      LOG_LEVEL: info
      MQTT_NEED_LOGIN: 'false'
      MQTT_USER: ''
      MQTT_PASSWD: ''
      MQTT_TOPIC_PREFIX: homenet2mqtt
      # AI 에이전트 API (선택). 16자 이상 토큰을 설정해야 활성화됩니다.
      AGENT_API_TOKEN: ''
      AGENT_ALLOW_PACKET_SEND: 'false'
    volumes:
      - ./h2m-config:/config
      # - /dev/ttyUSB0:/dev/ttyUSB0  # 시리얼 포트
    ports:
      # 호스트 내부에서만 접근. 외부 공개는 아래 '외부 접근' 참고.
      - '127.0.0.1:3000:3000'
    restart: unless-stopped
    # privileged: true  # 시리얼 포트 사용 시
```

## 초기화 절차

1. **최초 실행**: 컨테이너가 처음 시작되면 `./h2m-config` 폴더에 기본 설정 파일과 예제 파일이 자동으로 복사됩니다.
   - `default.homenet_bridge.yaml` - 기본 설정 파일
   - `examples/` - 예제 설정 파일들 (kocom, commax 등)
2. **설정 편집**: `./h2m-config` 폴더의 설정 파일을 사용자 환경에 맞게 수정합니다.
3. **재시작**: `docker compose restart`로 새로운 설정을 적용합니다.

## 환경변수

| 변수                      | 기본값                         | 설명                                            |
| ------------------------- | ------------------------------ | ----------------------------------------------- |
| `CONFIG_FILES`            | `default.homenet_bridge.yaml,` | 설정 파일 목록 (쉼표로 구분)                    |
| `CONFIG_ROOT`             | `/config`                      | 설정 파일 경로                                  |
| `MQTT_URL`                | `mqtt://localhost:1883`        | MQTT 브로커 URL                                 |
| `MQTT_NEED_LOGIN`         | `false`                        | MQTT 인증 사용 여부                             |
| `MQTT_USER`               | (빈 값)                        | MQTT 사용자명                                   |
| `MQTT_PASSWD`             | (빈 값)                        | MQTT 비밀번호                                   |
| `MQTT_TOPIC_PREFIX`       | `homenet2mqtt`                 | MQTT 토픽 접두사                                |
| `LOG_LEVEL`               | `info`                         | 로그 레벨                                       |
| `PORT`                    | `3000`                         | 웹 UI 포트                                      |
| `AGENT_API_TOKEN`         | (빈 값)                        | 에이전트 API Bearer 토큰. 16자 이상일 때 활성화 |
| `AGENT_ALLOW_PACKET_SEND` | `false`                        | 에이전트 API 패킷 전송 허용 여부                |

## 시리얼 포트 사용

RS485 어댑터 사용 시:

```yaml
volumes:
  - /dev/ttyUSB0:/dev/ttyUSB0
privileged: true
```

## 외부 접근

기본 포트 매핑은 호스트 루프백에만 바인딩됩니다.

- 같은 호스트: `http://127.0.0.1:3000`
- 같은 Docker 네트워크의 컨테이너: `http://<컨테이너명>:3000` (포트 매핑 불필요)
- LAN: 포트 바인딩을 호스트 IP로 넓히거나 리버스 프록시 사용 (예: `'192.168.0.10:3000:3000'`)

포트를 외부에 열면 인증이 없는 기존 `/api/*`와 UI WebSocket도 함께 노출됩니다. 외부 에이전트만 허용하려면 리버스 프록시로 `/api/v1/agent/*`만 전달하세요. 자세한 내용은 [AI 에이전트용 API](../../docs/guide/agent-api.md)의 '노출 및 네트워크 설정' 섹션을 참고하세요.

## AI 에이전트 API

`AGENT_API_TOKEN`을 16자 이상으로 설정하면 `/api/v1/agent` REST API와 MCP 엔드포인트가 활성화됩니다.

```bash
curl -H "Authorization: Bearer <AGENT_API_TOKEN>" \
  http://127.0.0.1:3000/api/v1/agent/capabilities
```

- 패킷 전송은 `AGENT_ALLOW_PACKET_SEND=true`일 때만 활성화됩니다.
- 토큰이 없거나 16자 미만이면 에이전트 API는 비활성화됩니다(UI와 기존 `/api/*`는 정상 동작).
- REST/MCP 사용법과 MCP 클라이언트 연결 방법은 [AI 에이전트용 API](../../docs/guide/agent-api.md)를 참고하세요.

## 참고

- 웹 UI: `http://127.0.0.1:3000` (같은 호스트 기준)
- 예제 설정: `./h2m-config/examples/`
