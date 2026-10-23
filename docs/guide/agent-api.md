# AI 에이전트용 API

> 이 문서는 AI 에이전트나 외부 자동화 도구가 Homenet2MQTT를 관측·분석·설정할 수 있도록 제공되는 **에이전트 API v1** 사용법을 정리합니다.

## 개요

에이전트 API는 UI와 **별도 포트**(기본 `3001`, `AGENT_API_PORT`)에서 `/api/v1/agent` 아래에 제공되는 버전 고정 REST API입니다. UI 포트(기본 `3000`)에서는 `/api/v1/agent/*`가 `404`를 반환하며, Agent 포트에서는 UI 정적 파일과 UI API를 제공하지 않습니다.

- OpenAPI 3.1 문서와 평문 가이드를 공개 엔드포인트로 제공합니다.
- 나머지 모든 엔드포인트는 **Bearer 토큰 인증이 필수**입니다.
- 응답은 JSON이며, 오류는 `{ "error": "...", "message"?: "...", "details"?: ... }` 형식입니다.
- 패킷 관측/분석, 캡처 제어, 엔티티 초안 검증·적용, 실시간 이벤트 스트림을 지원합니다.
- 초기 설정(예제 선택, serial 테스트, config 생성)과 설정 로드 중 새 브릿지 추가를 API로 수행할 수 있습니다.
- 같은 기능을 MCP Streamable HTTP 도구로도 제공합니다(`POST /api/v1/agent/mcp`).
- 엔티티는 **초안 작성 → 검증 → 적용** 순서로만 등록할 수 있으며, 적용 후 재시작이 필요합니다.

::: warning 보안 경고
에이전트 API 토큰은 RS485 버스를 제어하고 설정 파일을 수정할 수 있는 강력한 권한입니다. 토큰을 채팅, 이슈, 로그, URL에 노출하지 마세요. 패킷 전송 기능은 기본적으로 비활성화되어 있습니다.
:::

## REST와 MCP 선택

두 인터페이스는 같은 `agent/services/*` 도메인 로직을 공유합니다. MCP는 REST의 주요 기능을 도구로 노출한 어댑터이므로, 모든 REST 엔드포인트가 MCP 도구로 제공되지는 않습니다.

| 기준          | REST                                     | MCP                                     |
| ------------- | ---------------------------------------- | --------------------------------------- |
| 주요 사용자   | 스크립트, CI, curl, 일반 HTTP 클라이언트 | MCP를 지원하는 AI 클라이언트(Cursor 등) |
| 호출 방식     | `/api/v1/agent/*` + JSON                 | `POST /api/v1/agent/mcp` + JSON-RPC 2.0 |
| 실시간 이벤트 | SSE `/events`                            | `get_recent_events` 폴링                |
| 기능 탐색     | OpenAPI 문서, `llms.txt`                 | `tools/list`                            |
| 인증          | Bearer 토큰                              | 동일한 Bearer 토큰                      |

- 자동화 스크립트, 세밀한 HTTP 제어, SSE 스트리밍이 필요하면 **REST**를 사용하세요.
- AI 클라이언트에 도구로 연결하려면 **MCP**를 사용하세요. MCP는 REST 위에 얹힌 얇은 어댑터입니다.

## 토큰 설정

에이전트 API는 `AGENT_API_TOKEN`이 16자 이상으로 설정된 경우에만 활성화됩니다. 토큰이 없거나 너무 짧으면 모든 인증 엔드포인트가 `503 AGENT_API_DISABLED`를 반환합니다(OpenAPI/llms.txt는 계속 공개).

### Home Assistant Add-on

애드온 설정에서 다음 옵션을 사용합니다.

```yaml
agent_api_token: '충분히-긴-임의의-토큰'
agent_allow_packet_send: false
```

### Docker

```bash
docker run \
  -e AGENT_API_TOKEN="충분히-긴-임의의-토큰" \
  -e AGENT_ALLOW_PACKET_SEND=false \
  -e AGENT_API_PORT=3001 \
  -p 3001:3001 \
  ...
```

토큰 값은 로그에 출력되지 않습니다. `run.sh`는 `AGENT_API: enabled/disabled`와 사용 중인 포트만 표시합니다.

## 노출 및 네트워크 설정

에이전트 API는 전용 포트에서 Bearer 토큰으로 보호됩니다. UI는 별도 포트에서 비밀번호 인증으로 보호되므로, 포트를 분리해 외부에는 Agent 포트만 공개할 수 있습니다. 그래도 필요한 경우 포트 공개 범위를 최소화하고 방화벽/리버스 프록시로 접근 주체를 제한하세요.

### Docker

`deploy/docker/docker-compose.yml`의 기본값은 UI(3000)와 Agent API(3001)를 모두 호스트 루프백에만 바인딩합니다.

```yaml
environment:
  AGENT_API_PORT: '3001'
ports:
  - '127.0.0.1:3000:3000'
  - '127.0.0.1:3001:3001'
```

| 접근 주체                       | 주소                       | 필요한 설정                         |
| ------------------------------- | -------------------------- | ----------------------------------- |
| 같은 호스트의 프로세스          | `http://127.0.0.1:3001`    | 기본값                              |
| 같은 Docker 네트워크의 컨테이너 | `http://<컨테이너명>:3001` | 포트 매핑 불필요                    |
| 다른 호스트/LAN                 | `http://<H2M-HOST>:3001`   | 포트 바인딩 확장 또는 리버스 프록시 |

같은 Docker 네트워크의 컨테이너에서 호출한다면 포트를 공개할 필요가 없습니다. 두 컨테이너를 사용자 정의 네트워크에 함께 연결하고 서비스 이름으로 접근하세요.

```yaml
services:
  homenet2mqtt:
    # ...
    networks: [h2m]

  my-agent:
    # ...
    networks: [h2m]

networks:
  h2m:
```

LAN에서 직접 접근해야 한다면 바인딩을 특정 호스트 인터페이스로 넓힙니다.

```yaml
ports:
  # 예: 호스트 LAN IP가 192.168.0.10인 경우
  - '192.168.0.10:3001:3001'
```

모든 인터페이스에 열려면 `'3001:3001'`을 사용하세요. Agent API는 Bearer 토큰으로 보호되지만 토큰이 유출되면 RS485 제어가 가능하므로 방화벽으로 허용 대역을 제한하는 것을 권장합니다.

### 리버스 프록시로 에이전트 API만 노출

외부 에이전트가 다른 네트워크에서 접근해야 한다면 TLS를 종료하는 리버스 프록시를 두고 Agent 포트(3001)로 전달하는 구성을 권장합니다. Agent 포트에는 UI 라우트가 없으므로 `/api/v1/agent/*` 경로 제한은 선택 사항입니다.

**Caddy**

```text
h2m.example.com {
  handle /api/v1/agent/* {
    reverse_proxy 127.0.0.1:3001
  }

  handle {
    respond 404
  }
}
```

**Nginx**

```nginx
location /api/v1/agent/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

SSE(`/api/v1/agent/events`)를 사용한다면 응답 버퍼링을 끄고 읽기 타임아웃을 길게 설정하세요.

::: warning
Agent 포트를 외부에 열면 Bearer 토큰을 가진 클라이언트가 RS485 버스와 설정을 제어할 수 있습니다. 토큰을 강하게 관리하고 방화벽/네트워크 정책으로 접근 주체를 제한하세요. UI 포트(3000)는 비밀번호 인증으로 보호되지만 외부 공개 시 함께 방화벽 정책을 적용하는 것이 좋습니다.
:::

### Home Assistant Add-on

| 애드온                  | 네트워크                                   | 에이전트 API 접근                                  |
| ----------------------- | ------------------------------------------ | -------------------------------------------------- |
| Homenet2MQTT (MQTT)     | ingress 전용, `3001/tcp` 선택적 공개       | 포트를 공개한 경우 `http://<HA-IP>:<공개포트>`     |
| Homenet2Matter (Matter) | `host_network: true`                       | `http://<HA-IP>:3001`으로 직접 접근 가능           |

MQTT 애드온은 기본적으로 ingress를 통해서만 UI에 접근할 수 있으며, ingress는 3000(UI)만 프록시하므로 Agent API에 사용할 수 없습니다. 외부 에이전트가 필요하면 애드온 구성의 네트워크 섹션에서 `3001/tcp`를 공개하고 방화벽으로 접근을 제한하세요.

Matter 애드온은 `host_network: true`이므로 호스트의 3001 포트가 그대로 열립니다. 같은 LAN의 에이전트는 `http://<HA-IP>:3001`을 사용할 수 있지만, 호스트 방화벽에서 3001 포트 접근을 신뢰할 수 있는 대역으로 제한하세요. UI(3000)는 직접 접속 시 비밀번호를 요구합니다.

## 인증

```http
Authorization: Bearer <AGENT_API_TOKEN>
```

| 상황                  | 상태 코드 | `error`              |
| --------------------- | --------- | -------------------- |
| 토큰 미설정/16자 미만 | `503`     | `AGENT_API_DISABLED` |
| 헤더 누락             | `401`     | `UNAUTHORIZED`       |
| 토큰 불일치           | `401`     | `UNAUTHORIZED`       |
| 요청 한도 초과        | `429`     | `RATE_LIMITED`       |

## 공개 엔드포인트

| Method | Path                         | 설명                  |
| ------ | ---------------------------- | --------------------- |
| GET    | `/api/v1/agent/openapi.json` | OpenAPI 3.1 문서      |
| GET    | `/api/v1/agent/llms.txt`     | 짧은 평문 사용 가이드 |

## 인증 엔드포인트

| Method | Path                                     | 설명                                          |
| ------ | ---------------------------------------- | --------------------------------------------- |
| GET    | `/capabilities`                          | 버전, 지원 기능, 제한, 문서 링크              |
| GET    | `/setup`                                 | 설정 상태, 번들 예제 목록, 사용 중인 portId   |
| GET    | `/setup/examples/:filename`              | 예제의 serial/packet 기본값과 선택 엔티티     |
| POST   | `/setup/test-serial`                     | serial 배선 테스트 (설정 로드 중에도 가능)    |
| POST   | `/setup/apply`                           | 초기 설정(`init`) 또는 브릿지 추가(`add`)     |
| GET    | `/ports`                                 | 포트별 serial 설정, 브리지 상태, 엔티티 수    |
| GET    | `/entities?portId=`                      | 정규화된 엔티티 목록                          |
| GET    | `/entities/:entityId?portId=`            | 단일 엔티티 설정                              |
| GET    | `/state?portId=`                         | 최신 엔티티 상태 스냅샷                       |
| GET    | `/packets/history?portId=&limit=&since=` | parsed/command 패킷 통합 이력                 |
| GET    | `/packets/unmatched?portId=`             | 미매칭 패킷 + 횟수/최초·최근 시각             |
| POST   | `/packets/analyze`                       | 활성 또는 초안 설정으로 패킷 분석             |
| POST   | `/packets/preview`                       | 헤더/푸터/체크섬을 적용한 전송 패킷 미리보기  |
| POST   | `/packets/send`                          | 실제 RS485 전송 (옵트인 필요)                 |
| GET    | `/capture`                               | 원시 패킷 캡처 상태                           |
| POST   | `/capture/start`                         | 캡처 시작 (`mode`: `all` 또는 `valid`)        |
| POST   | `/capture/stop`                          | 캡처 종료 및 결과 반환                        |
| GET    | `/capture/files`                         | 캡처 파일 목록                                |
| GET    | `/capture/files/:filename`               | 캡처 파일 다운로드                            |
| DELETE | `/capture/files/:filename`               | 캡처 파일 삭제                                |
| GET    | `/events`                                | SSE 실시간 이벤트 스트림                      |
| POST   | `/entities/validate`                     | 저장 없이 초안 검증/충돌/디스커버리 미리보기  |
| POST   | `/entities/apply`                        | 초안을 YAML에 적용 + 백업 + 재시작 플래그     |
| POST   | `/mcp`                                   | MCP Streamable HTTP (JSON-RPC 2.0, stateless) |

`portId`는 로드된 포트가 하나뿐이면 생략할 수 있습니다. 여러 포트가 로드된 경우 생략하면 `400 PORT_ID_REQUIRED`가 반환됩니다.

## REST 사용법

아래 예시는 `curl` 기준입니다. `H2M`은 에이전트 API의 기본 URL이며 접근 환경에 맞게 변경하세요.

- 같은 호스트: `http://127.0.0.1:3001/api/v1/agent`
- LAN/원격: `https://<H2M-HOST>/api/v1/agent` (Agent 포트로 프록시)

### 초기 설정 및 브릿지 추가

로드된 설정이 하나도 없으면 UI 초기 설정 마법사 대신 API로 초기 설정을 완료할 수 있습니다. 이때 `/setup/apply`의 `mode`는 `init`(기본값)입니다. 이미 설정이 로드된 상태에서 새 포트(브릿지)를 추가하려면 `mode: "add"`를 사용하며, `/setup`의 `loadedPortIds`와 겹치지 않는 `portId`를 지정해야 합니다. `/setup/test-serial`은 설정 로드 여부와 관계없이 사용할 수 있습니다.

```bash
# 1. 설정 상태, 예제 목록, 사용 중인 portId 확인
curl -s -H "Authorization: Bearer $TOKEN" "$H2M/setup"

# 2. 예제의 serial 기본값과 선택 가능한 엔티티 확인
curl -s -H "Authorization: Bearer $TOKEN" "$H2M/setup/examples/bestin.homenet_bridge.yaml"

# 3. 배선 테스트 (최대 10개 패킷, 3초)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "example": "bestin.homenet_bridge.yaml",
    "serialPath": "/dev/ttyUSB0",
    "portId": "bestin_main"
  }' "$H2M/setup/test-serial"

# 4. 초기 설정 적용 (응답 후 자동 재시작)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "init",
    "example": "bestin.homenet_bridge.yaml",
    "serialPath": "/dev/ttyUSB0",
    "portId": "bestin_main",
    "selectedEntities": { "light": ["living_light"] },
    "restart": true
  }' "$H2M/setup/apply"

# 5. 설정이 이미 로드된 상태에서 새 브릿지 추가 (새 portId)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "add",
    "example": "bestin.homenet_bridge.yaml",
    "serialPath": "/dev/ttyUSB1",
    "portId": "bestin_second",
    "restart": true
  }' "$H2M/setup/apply"
```

- `mode` 기본값은 `init`입니다. 설정이 이미 로드된 상태에서 `init`으로 호출하면 기존 설정 보호를 위해 `409 SETUP_NOT_REQUIRED`가 반환됩니다.
- `mode: "add"`는 새 설정 파일(예: `default_2.homenet_bridge.yaml`)을 생성하고 `.initialized` 마커는 건드리지 않습니다. `portId`와 `serialPath`가 기존 포트와 중복되면 각각 `400 PORT_ID_DUPLICATE`, `400 SERIAL_PATH_DUPLICATE`가 반환됩니다.
- `example`에 `__empty__`를 지정하면 빈 config로 시작합니다. 이 경우 `serialConfig`에 `portId`, `path`, `baud_rate`, `data_bits`, `parity`, `stop_bits`를 모두 전달해야 합니다.
- `selectedEntities`를 생략하면 예제의 모든 엔티티를 사용합니다. 지정한 타입은 전달한 ID만 남기고, 결과가 비면 해당 타입을 제거합니다.
- `restart` 기본값은 `true`입니다. `false`이면 `.restart-required` 플래그만 기록하고 응답 후 재시작하지 않습니다.
- MQTT 접속 정보는 config가 아니라 환경변수/애드온 옵션이므로 API로 설정할 수 없습니다.
- Home Assistant MQTT 애드온은 기본적으로 `3001/tcp`가 공개되지 않으므로, 초기 설정에 API를 사용하려면 애드온 네트워크 설정에서 포트를 공개해야 합니다.

### 기본 워크플로

```bash
export H2M="http://127.0.0.1:3001/api/v1/agent"
export TOKEN="충분히-긴-임의의-토큰"

# 1. 현재 상태 관측
curl -s -H "Authorization: Bearer $TOKEN" "$H2M/ports"
curl -s -H "Authorization: Bearer $TOKEN" "$H2M/entities"
curl -s -H "Authorization: Bearer $TOKEN" "$H2M/state"
curl -s -H "Authorization: Bearer $TOKEN" "$H2M/packets/unmatched"

# 2. 원시 패킷 캡처
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"all"}' "$H2M/capture/start"

# ... 장치 조작 후 ...

curl -s -X POST -H "Authorization: Bearer $TOKEN" "$H2M/capture/stop"
curl -s -H "Authorization: Bearer $TOKEN" "$H2M/capture/files"

# 3. 캡처한 패킷을 초안 설정으로 분석 (저장 없음)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "portId": "default",
    "input": "AA550100020003",
    "draft": {
      "entities": {
        "sensor": [
          { "id": "my_sensor", "name": "My Sensor", "state": {}, "state_number": {} }
        ]
      }
    }
  }' "$H2M/packets/analyze"

# 4. 초안 검증 (충돌/디스커버리 미리보기)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "portId": "default",
    "entities": {
      "sensor": [
        { "id": "my_sensor", "name": "My Sensor", "state": {}, "state_number": {} }
      ]
    },
    "discoveryPreview": true
  }' "$H2M/entities/validate"

# 5. 검증 응답의 draftHash로 적용 (재시작 포함)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "portId": "default",
    "draftHash": "sha256:...",
    "entities": {
      "sensor": [
        { "id": "my_sensor", "name": "My Sensor", "state": {}, "state_number": {} }
      ]
    },
    "restart": true
  }' "$H2M/entities/apply"
```

### 패킷 분석

`POST /packets/analyze`

```json
{
  "portId": "default",
  "input": "AA550100020003",
  "draft": {
    "entities": { "sensor": [{ "id": "foo", "name": "Foo" }] },
    "automations": [],
    "packetDefaults": {}
  },
  "similarityThreshold": 0.8
}
```

- `input`은 hex 문자열(공백/구분자 허용) 또는 `[170, 85, ...]` 정수 배열입니다.
- `draft`가 있으면 활성 설정을 복제한 뒤 초안 엔티티/자동화/스크립트와 `packetDefaults`를 병합하고 정규화합니다. 저장은 하지 않습니다.
- 초안 검증 오류가 있어도 분석 가능한 부분은 `200`으로 반환되며, `draftValidationErrors`에 오류가 포함됩니다.
- 응답에는 기존 분석 결과(`packets`, `unmatchedPackets`, `automationMatches`, `errors`)와 `source`(`active`/`draft`), `packetDefaults`, `draftConflicts`, `draftApplicable`, `draftValidationErrors`가 포함됩니다.

### 엔티티 초안 검증

`POST /entities/validate`

```json
{
  "portId": "default",
  "entities": {
    "sensor": [{ "id": "foo", "name": "Foo", "state": {}, "state_number": {} }]
  },
  "automations": [],
  "scripts": [],
  "packetDefaults": {},
  "discoveryPreview": true,
  "similarityThreshold": 0.8
}
```

주요 응답 필드:

| 필드              | 설명                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `valid`           | 정규화 및 설정 검증을 통과했는지                                                               |
| `applicable`      | `valid`이면서 해결되지 않은 정확한 ID 충돌이 없는지                                            |
| `draftHash`       | 현재 파일 + 정규화된 초안의 SHA-256 해시                                                       |
| `normalized`      | 정규화된 초안 엔티티/자동화/스크립트/패킷 기본값                                               |
| `errors`          | 검증 오류                                                                                      |
| `warnings`        | 시그니처 유사 충돌 등 경고                                                                     |
| `conflicts`       | ID 충돌(`kind: "id"`) 및 시그니처 유사 충돌(`kind: "signature"`)                               |
| `discovery`       | `discoveryPreview: true`일 때 엔티티별 MQTT 디스커버리 `{draftId, entityType, topic, payload}` |
| `restartRequired` | 항상 `true`                                                                                    |

- 엔티티 `id`와 `unique_id`는 MQTT 토픽 안전 문자(`^[A-Za-z0-9_-]+$`)만 허용합니다.
- 정확한 ID 충돌은 적용을 막습니다. 시그니처 유사 충돌은 경고이며 적용을 막지 않습니다.

### 엔티티 초안 적용

`POST /entities/apply`

```json
{
  "portId": "default",
  "draftHash": "sha256:...",
  "entities": { "sensor": [{ "id": "foo", "name": "Foo" }] },
  "resolutions": { "foo": "overwrite" },
  "renames": { "bar": "bar_2" },
  "restart": false
}
```

- `draftHash`가 현재 파일/초안과 다르면 `409 DRAFT_STALE`을 반환합니다. 다시 검증한 뒤 적용해야 합니다.
- 정확한 ID 충돌은 `resolutions`(`overwrite` 또는 `skip`) 또는 `renames`로 해결합니다.
- 성공 시 YAML 백업 생성 → 설정 파일 기록 → 인메모리 설정 갱신 순서로 처리하고 `restartRequired: true`를 반환합니다.
- `restart: true`이면 응답 전송 후 서비스가 재시작됩니다.
- 재시작 전까지 실행 중인 브리지는 기존 디바이스만 사용합니다(라이브 등록은 지원하지 않음).

### 패킷 미리보기/전송

`POST /packets/preview`

```json
{
  "portId": "default",
  "hex": "010203",
  "header": true,
  "footer": true,
  "checksum": true
}
```

`POST /packets/send`는 `AGENT_ALLOW_PACKET_SEND=true`일 때만 동작하며, 추가로 `confirm: true`가 필요합니다.

```json
{
  "portId": "default",
  "hex": "010203",
  "header": true,
  "footer": true,
  "checksum": true,
  "confirm": true,
  "count": 1,
  "interval": 100
}
```

- `count`는 1~10, `interval`은 10~1000ms로 제한됩니다.
- 옵트인이 꺼져 있으면 `403 PACKET_SEND_DISABLED`를 반환합니다.
- 전송 요청은 별도의 강한 rate limit(10초당 20회)이 적용되고, 감사 로그에는 `portId`, 패킷 hex, 횟수만 기록됩니다(토큰 제외).
- 잘못된 패킷을 보내면 장치가 오동작할 수 있으므로 반드시 미리보기로 확인하세요.

### 실시간 이벤트 (SSE)

```bash
curl -N -H "Authorization: Bearer $TOKEN" \
  "$H2M/events?types=state,parsed-packet,unmatched-packet,command-packet,bridge-status"
```

- `types`: `state`, `parsed-packet`, `unmatched-packet`, `command-packet`, `bridge-status`, `raw` (쉼표 구분)
- `portId`: 특정 포트만 수신
- `raw`: `all` 또는 `valid` (지정 시 `raw` 타입이 자동 추가됨)
- `sinceId` 또는 `Last-Event-ID` 헤더: 최근 500개 이벤트까지 재생
- 최초 연결 시 `event: snapshot`으로 포트/상태/캡처 현황을 전송합니다.
- 이벤트는 `id`, `event`, `data` 형식이며 15초마다 `: ping` 하트비트를 보냅니다.
- 동시 연결은 최대 8개입니다. 초과 시 `429 TOO_MANY_EVENT_STREAMS`를 반환합니다.
- `raw` 구독 시 UI WebSocket과 공유되는 원시 패킷 리스너가 참조 카운트로 켜지고, 마지막 구독이 종료되면 자동으로 꺼집니다.

## 제한 및 오류 코드

| 항목                   | 값                             |
| ---------------------- | ------------------------------ |
| 에이전트 API 요청 한도 | 분당 120회 (전역 300회와 별도) |
| 패킷 전송 한도         | 10초당 20회                    |
| 패킷 이력 최대 조회    | 1,000건                        |
| SSE 이벤트 버퍼        | 500건                          |
| SSE 동시 연결          | 8개                            |
| 패킷 전송 횟수         | 최대 10회                      |

자주 만나는 오류:

- `CONFIG_NOT_LOADED`: 아직 설정이 로드되지 않음
- `PORT_NOT_FOUND` / `PORT_ID_REQUIRED`: 포트 지정 오류
- `ENTITY_NOT_FOUND`: 엔티티 없음
- `DRAFT_INVALID` (`422`): 초안 검증 실패
- `DRAFT_STALE` (`409`): 검증 후 파일/초안이 변경됨
- `DRAFT_CONFLICT` (`409`): 해결되지 않은 ID 충돌

## 기존 API와의 관계

- 기존 `/api/*`와 `/api/stream`(WebSocket)은 번들 UI를 위해 그대로 유지됩니다.
- **기존 `/api/*`는 여전히 인증이 없습니다.** 에이전트 API만 Bearer 토큰으로 보호됩니다. 외부 네트워크에 서비스를 노출하는 경우 리버스 프록시 등으로 접근을 제한하세요.
- 에이전트 API는 기존 UI API와 같은 서비스/설정 로직을 공유하므로, 두 경로에서 동시에 설정을 수정하면 포트별 쓰기 락으로 직렬화됩니다.

## MCP 사용법

REST의 주요 기능을 **MCP Streamable HTTP** 도구로도 제공합니다. MCP는 REST를 대체하지 않으며, REST 라우트와 동일한 `agent/services/*` 도메인 로직을 호출하는 얇은 어댑터입니다.

MCP 클라이언트는 일반적으로 다음 순서로 연결합니다.

1. `initialize`로 프로토콜 버전과 서버 정보를 교환합니다.
2. `notifications/initialized`를 보냅니다(응답 본문 없음).
3. `tools/list`로 사용 가능한 도구를 확인합니다.
4. `tools/call`로 도구를 실행합니다.

- 엔드포인트: `POST /api/v1/agent/mcp`
- 전송: Streamable HTTP, JSON-RPC 2.0, **stateless**(세션 ID 없음, `GET`/`DELETE`는 `405`)
- 인증: REST와 동일한 `Authorization: Bearer <AGENT_API_TOKEN>` 헤더
- `Content-Type: application/json` 필수
- 지원 메서드: `initialize`, `notifications/initialized`(202, 본문 없음), `ping`, `tools/list`, `tools/call`
- 지원 프로토콜 버전: `2025-06-18`, `2025-03-26`, `2024-11-05`

### 도구 목록

| 도구                                        | 설명                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `get_setup_state`                           | 설정 상태, 예제 목록, 사용 중인 portId                                |
| `get_setup_example`                         | 예제의 serial/packet 기본값과 선택 엔티티                             |
| `test_setup_serial`                         | serial 배선 테스트 (설정 로드 중에도 가능)                            |
| `apply_initial_setup`                       | 초기 설정(`mode="init"`) 또는 브릿지 추가(`mode="add"`) + 재시작       |
| `list_ports`                                | 로드된 포트/브리지 상태/엔티티 수                                     |
| `get_entities`                              | 정규화된 엔티티 목록 (`portId` 선택)                                  |
| `get_entity_state`                          | 최신 엔티티 상태 스냅샷                                               |
| `get_packet_history`                        | parsed/command 통합 패킷 이력                                         |
| `get_unmatched_packets`                     | 미매칭 패킷 + 횟수/최초·최근 시각                                     |
| `analyze_packet`                            | 활성 또는 초안 설정으로 패킷 분석                                     |
| `start_capture` / `stop_capture`            | 원시 패킷 캡처 제어                                                   |
| `get_capture_status` / `list_capture_files` | 캡처 상태와 저장 파일 목록                                            |
| `validate_entity_draft`                     | 저장 없이 초안 검증 + 충돌/디스커버리 미리보기                        |
| `apply_entity_draft`                        | `draftHash`로 초안을 YAML에 적용 + 백업 + 재시작 플래그               |
| `get_recent_events`                         | `afterId` 기반 이벤트 폴링 (최근 500건 버퍼, SSE 대체)                |
| `send_packet`                               | RS485 전송. `AGENT_ALLOW_PACKET_SEND=true`일 때만 `tools/list`에 노출 |

`send_packet`이 비활성인 상태에서 직접 호출하면 `isError: true`와 `PACKET_SEND_DISABLED`가 반환됩니다. 적용 계열 도구는 REST와 동일하게 YAML 백업과 초안 해시 검증을 수행합니다.

`apply_initial_setup`은 설정이 이미 로드된 상태에서 `mode="init"`이면 `isError: true`와 `SETUP_NOT_REQUIRED`를 반환합니다. 새 브릿지는 `mode="add"`와 `get_setup_state`의 `loadedPortIds`에 없는 `portId`로 추가하세요. `test_setup_serial`은 설정 로드 여부와 관계없이 동작합니다.

캡처 파일 다운로드/삭제와 전송 패킷 미리보기는 MCP 도구로 제공되지 않으므로 REST를 사용하세요.

### 응답 형식

`tools/call` 성공 시 `content`(텍스트)와 `structuredContent`(JSON)가 함께 반환됩니다.

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{ "type": "text", "text": "{ ... }" }],
    "structuredContent": { "unmatchedPackets": [] }
  }
}
```

도구 실행 오류는 JSON-RPC 오류가 아니라 `result.isError: true`로 반환됩니다.

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "isError": true,
    "content": [{ "type": "text", "text": "{\"error\":\"PORT_NOT_FOUND\",\"message\":\"...\"}" }],
    "structuredContent": { "error": "PORT_NOT_FOUND", "message": "..." }
  }
}
```

### curl 예시

```bash
# 1. 초기화
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}' \
  "$H2M/mcp"

# 2. 초기화 완료 알림 (202, 본문 없음)
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  "$H2M/mcp"

# 3. 도구 목록
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  "$H2M/mcp"

# 4. 도구 호출
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_unmatched_packets","arguments":{}}}' \
  "$H2M/mcp"

# 5. 초안 검증 → 적용
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"validate_entity_draft","arguments":{"discoveryPreview":true,"entities":{"sensor":[{"id":"my_sensor","name":"My Sensor","state":{},"state_number":{}}]}}}}' \
  "$H2M/mcp"

curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"apply_entity_draft","arguments":{"draftHash":"sha256:...","entities":{"sensor":[{"id":"my_sensor","name":"My Sensor","state":{},"state_number":{}}]},"restart":true}}}' \
  "$H2M/mcp"
```

### 클라이언트 연결

MCP Streamable HTTP를 지원하는 클라이언트에서 URL과 인증 헤더를 등록합니다.

**Cursor (`mcp.json`)**

```json
{
  "mcpServers": {
    "homenet2mqtt": {
      "url": "http://127.0.0.1:3001/api/v1/agent/mcp",
      "headers": {
        "Authorization": "Bearer <AGENT_API_TOKEN>"
      }
    }
  }
}
```

**stdio 전용 클라이언트 (`mcp-remote` 브리지)**

```json
{
  "mcpServers": {
    "homenet2mqtt": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://127.0.0.1:3001/api/v1/agent/mcp",
        "--header",
        "Authorization: Bearer <AGENT_API_TOKEN>"
      ]
    }
  }
}
```

클라이언트 설정의 URL은 접근 환경에 맞게 변경하세요.

- 같은 호스트: `http://127.0.0.1:3001/api/v1/agent/mcp`
- 같은 Docker 네트워크: `http://<컨테이너명>:3001/api/v1/agent/mcp`
- LAN/원격: `https://<H2M-HOST>/api/v1/agent/mcp` (Agent 포트로 리버스 프록시 권장)
- Matter 애드온: `http://<HA-IP>:3001/api/v1/agent/mcp`
- MQTT 애드온: ingress는 외부 MCP 클라이언트용이 아니므로 `3001/tcp` 포트 공개 또는 리버스 프록시가 필요합니다.

위 예시는 같은 호스트에서 실행하는 경우를 기준으로 합니다. 원격 서버라면 `127.0.0.1` 대신 실제 호스트 이름/IP를 사용하세요.

### 오류 매핑

- 도구 실행 오류는 JSON-RPC 오류가 아니라 `result.isError: true`와 `{ "error": "...", "message": "..." }` 구조로 반환됩니다.
- 알 수 없는 도구/잘못된 `params`는 JSON-RPC `-32602`, 알 수 없는 메서드는 `-32601`, 잘못된 요청은 HTTP 400 + `-32600`입니다.
- 인증, rate limit, 초안 해시/충돌 규칙은 REST와 동일합니다.

## 관련 문서

- [Docker 환경변수 레퍼런스](./environment-variables.md)
- [설정 개요](/config/)
- [트러블슈팅](./troubleshooting.md)
