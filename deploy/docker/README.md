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
      # AI 에이전트 API 사용 토글 (선택). 토큰/포트/패킷 전송 허용은 웹 UI에서 설정합니다.
      AGENT_API_ENABLED: 'false'
    volumes:
      - ./h2m-config:/config
      # - /dev/ttyUSB0:/dev/ttyUSB0  # 시리얼 포트
    ports:
      # 호스트 내부에서만 접근. 외부 공개는 아래 '외부 접근' 참고.
      # UI는 첫 접속 시 비밀번호를 설정해야 합니다.
      - '127.0.0.1:3000:3000'
      # Agent API 전용 포트 (Bearer 토큰 인증). 컨테이너 포트는 UI에서 바꾸면 매핑도 함께 수정.
      - '127.0.0.1:3001:3001'
    restart: unless-stopped
    # privileged: true  # 시리얼 포트 사용 시
```

## 초기화 절차

1. **최초 실행**: 컨테이너가 처음 시작되면 `./h2m-config` 폴더에 기본 설정 파일과 예제 파일이 자동으로 복사됩니다.
   - `default.homenet_bridge.yaml` - 기본 설정 파일
   - `examples/` - 예제 설정 파일들 (kocom, commax 등)
2. **설정 편집**: `./h2m-config` 폴더의 설정 파일을 사용자 환경에 맞게 수정합니다.
3. **재시작**: `docker compose restart`로 새로운 설정을 적용합니다.
4. **UI 비밀번호 / 에이전트 설정**: `http://127.0.0.1:3000`에 처음 접속하면 비밀번호 설정 화면이 표시됩니다. 8자 이상 입력하면 로그인되며, 이후 접속부터 로그인 화면이 표시됩니다.
   - 같은 화면에서 에이전트 API 토큰 자동 생성과 포트/패킷 전송 허용을 함께 설정할 수 있습니다. 에이전트로 초기 마법사를 진행시키려면 여기서 토큰을 발급받아 에이전트에 전달하세요.
   - 비밀번호는 `./h2m-config/ui-auth.json`에 scrypt 해시로, 에이전트 API 토큰(해시)·포트·패킷 전송 허용 여부는 `./h2m-config/agent-api.json`에 저장됩니다(둘 다 평문 미저장, 파일 모드 `0600`).
   - 변경/로그아웃: UI의 **설정 → 애플리케이션 관리 → UI 보안 / Agent API**.
   - 분실 시: 컨테이너 중지 → `./h2m-config/ui-auth.json` 삭제 → 재시작 → 첫 접속에서 재설정.

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
| `PORT`                    | `3000`                         | UI 포트 (정적 파일, UI API, WebSocket)          |
| `AGENT_API_ENABLED`       | `false`                        | 에이전트 API 사용 토글 (유일한 에이전트 env 옵션) |

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

UI 포트를 외부에 열더라도 UI API는 비밀번호 인증으로 보호됩니다. Agent API는 별도 포트(기본 3001)에만 존재하며 Bearer 토큰으로 보호됩니다. 외부 에이전트만 허용하려면 3001 포트만 공개하세요. 자세한 내용은 [AI 에이전트용 API](../../docs/guide/agent-api.md)의 '노출 및 네트워크 설정' 섹션을 참고하세요.

## AI 에이전트 API

`AGENT_API_ENABLED=true`로 활성화하면 `/api/v1/agent` REST API와 MCP 엔드포인트가 **전용 포트(기본 3001)** 에서 제공됩니다. 토큰·포트·패킷 전송 허용 여부는 환경변수가 아니라 웹 UI에서 관리합니다.

```bash
curl -H "Authorization: Bearer <UI에서 발급한 토큰>" \
  http://127.0.0.1:3001/api/v1/agent/capabilities
```

- UI 포트(3000)의 `/api/v1/agent/*`는 `404`를 반환합니다. 에이전트 API는 전용 포트에서만 동작합니다.
- 토큰은 **설정 → Agent API**(또는 첫 접속 화면)에서 발급/재발급하며, 평문은 발급 시점 한 번만 표시됩니다. 해시는 `./h2m-config/agent-api.json`에 저장됩니다.
- 포트가 이미 사용 중이면 에이전트 API가 다음 빈 포트(최대 +9)로 자동 이동하며, UI에서 실제 포트를 확인할 수 있습니다. `AGENT_API_ENABLED=false`면 포트 자체가 열리지 않습니다.
- 컨테이너 포트를 바꾸면 `ports:` 매핑도 함께 수정하세요.
- 패킷 전송은 **설정 → Agent API**에서 허용할 때만 활성화됩니다.
- REST/MCP 사용법과 MCP 클라이언트 연결 방법은 [AI 에이전트용 API](../../docs/guide/agent-api.md)를 참고하세요.

## 참고

- 웹 UI: `http://127.0.0.1:3000` (같은 호스트 기준)
- Agent API: `http://127.0.0.1:3001` (같은 호스트 기준)
- 예제 설정: `./h2m-config/examples/`
