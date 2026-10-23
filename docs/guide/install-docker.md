---
next:
  text: 'UI 설명'
  link: '/guide/getting-started'
---

# Docker 설치

> 이 섹션에서 무엇을 해결하나요?
>
> - Docker Compose로 Homenet Bridge (h2m) 를 실행합니다.
> - 설정 파일 볼륨과 환경 변수를 연결합니다.
> - 실행 후 Web UI 접속을 검증합니다.

- 예상 소요 시간: **10~20분**
- 필수 준비물: Docker/Docker Compose, MQTT 브로커 정보(MQTT 연동 시) 또는 스마트홈 허브(Matter 연동 시)
- 완료 기준:
  - 컨테이너 실행 상태 확인
  - Web UI 접속 성공
  - 설정 파일이 볼륨 경로에 저장됨

## docker-compose 예시

### 1) MQTT 연동 모드 (h2m-mqtt)

기존 Home Assistant에 MQTT Discovery 방식으로 연동하는 경우 아래의 `docker-compose.yml` 구조를 사용합니다.

```yaml
services:
  homenet2mqtt:
    image: nubiz/homenet2mqtt:latest
    container_name: homenet2mqtt
    environment:
      INTEGRATION_TYPE: mqtt # MQTT 모드로 실행
      MQTT_URL: mqtt://localhost:1883
      PORT: '3000'
      AGENT_API_ENABLED: 'false' # AI 에이전트 API 사용 토글 (true면 UI에서 설정한 에이전트 포트가 열립니다. 기본 3001)
      LOG_LEVEL: info
      TIMEZONE: 'Asia/Seoul'
      # MQTT에 로그인 정보가 필요하다면 true로 설정하고 MQTT_USER, MQTT_PASSWD에 정보를 입력하세요.
      MQTT_NEED_LOGIN: 'false'
      MQTT_USER: ''
      MQTT_PASSWD: ''
      MQTT_TOPIC_PREFIX: homenet2mqtt
      # Homeassistant에서 기기가 자동으로 추가되게하려면 true로 설정.
      DISCOVERY_ENABLED: 'false'
      # AI 에이전트 API는 위의 AGENT_API_ENABLED로만 켭니다.
      # Bearer 토큰·포트·패킷 전송 허용은 UI(첫 접속 화면 또는 설정 > Agent API)에서 관리합니다.
    # USB RS485 장치를 사용하는경우 devices를 주석해제하여 사용하세요.
    # devices:
    #   - /dev/ttyUSB0:/dev/ttyUSB0
    volumes:
      - ./h2m-config:/config
    ports:
      # 호스트 내부에서만 접근. LAN 공개는 아래 '접속 주소'를 참고하세요.
      # UI는 첫 접속 시 비밀번호를 설정해야 합니다.
      - '127.0.0.1:3000:3000'
      # Agent API 전용 포트 (Bearer 토큰 인증). UI에서 에이전트 포트를 바꿨다면 컨테이너 쪽 숫자도 함께 수정하세요.
      - '127.0.0.1:3001:3001'
    restart: unless-stopped
```

### 2) Matter 연동 모드 (h2m-matter) 기동 시 중요 주의사항 (Network Mode)

Matter 프로토콜은 스마트홈 플랫폼(스마트싱스, 홈킷, 구글홈 등)의 로컬 기기 검색을 위해 **mDNS (멀티캐스트 DNS, UDP 5353)** 프로토콜을 사용합니다. Docker의 기본 브릿지 네트워크 모드(`ports:` 포워딩) 환경에서는 이 멀티캐스트 패킷이 중계되지 않아 외부 스마트홈 컨트롤러가 브릿지 기기를 발견할 수 없습니다.

따라서 **`INTEGRATION_TYPE=matter`**로 구동하는 컨테이너는 반드시 네트워크 모드를 **`network_mode: host`** (또는 Docker CLI 실행 시 `--net=host`)로 실행해야 합니다.

```yaml
services:
  homenet2matter:
    image: nubiz/homenet2mqtt:latest
    container_name: homenet2matter
    network_mode: host # Matter mDNS 탐색 및 페어링 연결을 위해 필수적입니다.
    privileged: true
    environment:
      INTEGRATION_TYPE: matter # Matter 모드로 실행
      PORT: '3000' # UI 포트
      AGENT_API_ENABLED: 'false' # AI 에이전트 API 사용 토글 (포트는 설정 > Agent API에서 변경)
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

- 같은 호스트에서는 `http://127.0.0.1:3000`으로 접속한 뒤 설정 마법사를 진행합니다.
- 다른 기기(LAN)에서 접속하려면 포트 바인딩을 호스트 IP로 넓히거나 리버스 프록시를 사용하세요. 예: `- '192.168.0.10:3000:3000'`
- Matter 모드는 `network_mode: host`이므로 `http://<서버IP>:3000`으로 접속할 수 있습니다. 3000 포트는 방화벽으로 접근을 제한하세요.
- 설정 파일은 `./h2m-config`에 저장됩니다.

### UI 비밀번호

UI는 직접 접속 시 항상 비밀번호 인증을 요구합니다.

1. 처음 `http://127.0.0.1:3000`에 접속하면 **비밀번호 설정** 화면이 표시됩니다. 8자 이상의 비밀번호를 입력하세요. 에이전트 API를 켠 상태라면 같은 화면에서 에이전트 토큰 자동 생성·포트·패킷 전송 허용을 함께 설정할 수 있습니다.
2. 설정 후 자동으로 로그인되며, 이후 접속부터는 로그인 화면이 표시됩니다.
3. **설정 → 애플리케이션 관리 → UI 보안**에서 언제든 비밀번호를 변경하거나 로그아웃할 수 있습니다.

::: warning 최초 비밀번호 설정 제한 시간
Docker 환경에서는 컨테이너 시작 후 **15분 이내**에 최초 비밀번호를 설정해야 합니다. 15분이 지나면 비밀번호 설정이 차단되고 UI에 만료 안내가 표시됩니다. 이때는 `docker compose restart`로 컨테이너를 재시작하면 새 15분 설정 시간이 시작됩니다.

3000 포트에 접근할 수 있는 사람은 누구나 비밀번호를 먼저 선점할 수 있으므로, 첫 실행 직후 비밀번호를 설정하고 직접 접속 포트는 신뢰할 수 있는 네트워크에만 노출하세요.
:::

비밀번호는 `./h2m-config/ui-auth.json`에 scrypt 해시로 저장되며(파일 모드 `0600`), 평문은 저장되지 않습니다. 이 파일을 백업하면 비밀번호 설정을 유지할 수 있습니다.

비밀번호를 분실했다면 서비스를 중지한 뒤 `./h2m-config/ui-auth.json`을 삭제하고 다시 시작하세요. 재시작 후 첫 접속에서 새 비밀번호를 설정할 수 있습니다(Docker는 재시작 후 15분 이내). 삭제 시 기존 세션도 모두 무효화됩니다.

::: tip
Home Assistant ingress로 접속하는 애드온 환경은 Home Assistant 로그인으로 인증되므로 UI 비밀번호를 묻지 않습니다. Docker 직접 접속과 Matter 애드온의 직접 포트 접근에만 비밀번호가 필요합니다.
:::

## AI 에이전트 API

`AGENT_API_ENABLED=true`로 켜면 `/api/v1/agent` REST API와 MCP 엔드포인트가 **Agent API 전용 포트(기본 3001)** 에서 제공되고, 그 외 설정은 모두 웹 UI에서 합니다.

```yaml
environment:
  AGENT_API_ENABLED: 'true'
ports:
  - '127.0.0.1:3001:3001'
```

- Bearer 토큰은 환경변수가 아니라 UI에서 발급합니다. 첫 접속 화면에서 UI 비밀번호와 함께 에이전트 토큰을 자동 생성할 수 있고, 이후에는 **설정 > Agent API**에서 발급·재발급합니다. 평문은 발급 시점에 한 번만 표시되며 `./h2m-config/agent-api.json`에는 SHA-256 해시만 저장됩니다.
- 포트가 이미 사용 중이면 에이전트 API가 최대 9번까지 다음 포트로 자동 이동하며, UI와 Matter 브리지는 그대로 동작합니다. 실제 바인딩된 포트는 설정 화면과 기동 로그에서 확인할 수 있습니다.
- 토글이 `false`이면 Agent 포트 자체가 열리지 않습니다.
- Agent API는 UI 포트(3000)에서 제공되지 않습니다. 기존 `:3000/api/v1/agent` 사용자는 `:3001`로 변경하세요.
- 기본 포트 매핑은 호스트 루프백 전용입니다. 외부 에이전트가 접근하려면 [AI 에이전트용 API](./agent-api.md)의 '노출 및 네트워크 설정' 섹션을 따르세요.
- RS485 패킷 전송은 **설정 > Agent API**에서 허용한 경우에만 활성화됩니다.

## 다음 단계

- **MQTT 연동 모드 (h2m-mqtt)**: 설정 완료 후 홈어시스턴트에서 자동으로 기기가 등록됩니다.
- **Matter 연동 모드 (h2m-matter)**: [Matter 연결 가이드](./matter-connection.md)를 참고하여 각 스마트홈 플랫폼에 연동하세요.
