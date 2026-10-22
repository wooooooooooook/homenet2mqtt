# AI 에이전트용 API

> 이 문서는 AI 에이전트나 외부 자동화 도구가 Homenet2MQTT를 관측·분석·설정할 수 있도록 제공되는 **에이전트 API v1** 사용법을 정리합니다.

## 개요

에이전트 API는 기존 UI용 `/api/*`와 별도로 `/api/v1/agent` 아래에 제공되는 버전 고정 REST API입니다.

- OpenAPI 3.1 문서와 평문 가이드를 공개 엔드포인트로 제공합니다.
- 나머지 모든 엔드포인트는 **Bearer 토큰 인증이 필수**입니다.
- 응답은 JSON이며, 오류는 `{ "error": "...", "message"?: "...", "details"?: ... }` 형식입니다.
- 패킷 관측/분석, 캡처 제어, 엔티티 초안 검증·적용, 실시간 이벤트 스트림을 지원합니다.
- 같은 기능을 MCP Streamable HTTP 도구로도 제공합니다(`POST /api/v1/agent/mcp`).
- 엔티티는 **초안 작성 → 검증 → 적용** 순서로만 등록할 수 있으며, 적용 후 재시작이 필요합니다.

::: warning 보안 경고
에이전트 API 토큰은 RS485 버스를 제어하고 설정 파일을 수정할 수 있는 강력한 권한입니다. 토큰을 채팅, 이슈, 로그, URL에 노출하지 마세요. 패킷 전송 기능은 기본적으로 비활성화되어 있습니다.
:::

## 토큰 설정

에이전트 API는 `AGENT_API_TOKEN`이 16자 이상으로 설정된 경우에만 활성화됩니다. 토큰이 없거나 너무 짧으면 모든 인증 엔드포인트가 `503 AGENT_API_DISABLED`를 반환합니다(OpenAPI/llms.txt는 계속 공개).

### Home Assistant Add-on

애드온 설정에서 다음 옵션을 사용합니다.

```yaml
agent_api_token: "충분히-긴-임의의-토큰"
agent_allow_packet_send: false
```

### Docker

```bash
docker run \
  -e AGENT_API_TOKEN="충분히-긴-임의의-토큰" \
  -e AGENT_ALLOW_PACKET_SEND=false \
  ...
```

토큰 값은 로그에 출력되지 않습니다. `run.sh`는 `AGENT_API: enabled/disabled`만 표시합니다.

## 인증

```http
Authorization: Bearer <AGENT_API_TOKEN>
```

| 상황 | 상태 코드 | `error` |
| --- | --- | --- |
| 토큰 미설정/16자 미만 | `503` | `AGENT_API_DISABLED` |
| 헤더 누락 | `401` | `UNAUTHORIZED` |
| 토큰 불일치 | `401` | `UNAUTHORIZED` |
| 요청 한도 초과 | `429` | `RATE_LIMITED` |

## 공개 엔드포인트

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/v1/agent/openapi.json` | OpenAPI 3.1 문서 |
| GET | `/api/v1/agent/llms.txt` | 짧은 평문 사용 가이드 |

## 인증 엔드포인트

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/capabilities` | 버전, 지원 기능, 제한, 문서 링크 |
| GET | `/ports` | 포트별 serial 설정, 브리지 상태, 엔티티 수 |
| GET | `/entities?portId=` | 정규화된 엔티티 목록 |
| GET | `/entities/:entityId?portId=` | 단일 엔티티 설정 |
| GET | `/state?portId=` | 최신 엔티티 상태 스냅샷 |
| GET | `/packets/history?portId=&limit=&since=` | parsed/command 패킷 통합 이력 |
| GET | `/packets/unmatched?portId=` | 미매칭 패킷 + 횟수/최초·최근 시각 |
| POST | `/packets/analyze` | 활성 또는 초안 설정으로 패킷 분석 |
| POST | `/packets/preview` | 헤더/푸터/체크섬을 적용한 전송 패킷 미리보기 |
| POST | `/packets/send` | 실제 RS485 전송 (옵트인 필요) |
| GET | `/capture` | 원시 패킷 캡처 상태 |
| POST | `/capture/start` | 캡처 시작 (`mode`: `all` 또는 `valid`) |
| POST | `/capture/stop` | 캡처 종료 및 결과 반환 |
| GET | `/capture/files` | 캡처 파일 목록 |
| GET | `/capture/files/:filename` | 캡처 파일 다운로드 |
| DELETE | `/capture/files/:filename` | 캡처 파일 삭제 |
| GET | `/events` | SSE 실시간 이벤트 스트림 |
| POST | `/entities/validate` | 저장 없이 초안 검증/충돌/디스커버리 미리보기 |
| POST | `/entities/apply` | 초안을 YAML에 적용 + 백업 + 재시작 플래그 |
| POST | `/mcp` | MCP Streamable HTTP (JSON-RPC 2.0, stateless) |

`portId`는 로드된 포트가 하나뿐이면 생략할 수 있습니다. 여러 포트가 로드된 경우 생략하면 `400 PORT_ID_REQUIRED`가 반환됩니다.

## 에이전트 워크플로

```bash
export H2M="http://localhost:3000/api/v1/agent"
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

## 패킷 분석

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

## 엔티티 초안 검증

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

| 필드 | 설명 |
| --- | --- |
| `valid` | 정규화 및 설정 검증을 통과했는지 |
| `applicable` | `valid`이면서 해결되지 않은 정확한 ID 충돌이 없는지 |
| `draftHash` | 현재 파일 + 정규화된 초안의 SHA-256 해시 |
| `normalized` | 정규화된 초안 엔티티/자동화/스크립트/패킷 기본값 |
| `errors` | 검증 오류 |
| `warnings` | 시그니처 유사 충돌 등 경고 |
| `conflicts` | ID 충돌(`kind: "id"`) 및 시그니처 유사 충돌(`kind: "signature"`) |
| `discovery` | `discoveryPreview: true`일 때 엔티티별 MQTT 디스커버리 `{draftId, entityType, topic, payload}` |
| `restartRequired` | 항상 `true` |

- 엔티티 `id`와 `unique_id`는 MQTT 토픽 안전 문자(`^[A-Za-z0-9_-]+$`)만 허용합니다.
- 정확한 ID 충돌은 적용을 막습니다. 시그니처 유사 충돌은 경고이며 적용을 막지 않습니다.

## 엔티티 초안 적용

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

## 패킷 미리보기/전송

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

## 실시간 이벤트 (SSE)

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

| 항목 | 값 |
| --- | --- |
| 에이전트 API 요청 한도 | 분당 120회 (전역 300회와 별도) |
| 패킷 전송 한도 | 10초당 20회 |
| 패킷 이력 최대 조회 | 1,000건 |
| SSE 이벤트 버퍼 | 500건 |
| SSE 동시 연결 | 8개 |
| 패킷 전송 횟수 | 최대 10회 |

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

## MCP

같은 기능을 **MCP Streamable HTTP** 도구로도 제공합니다. MCP는 REST를 대체하지 않으며, REST 라우트와 동일한 `agent/services/*` 도메인 로직을 호출하는 얇은 어댑터입니다.

- 엔드포인트: `POST /api/v1/agent/mcp`
- 전송: Streamable HTTP, JSON-RPC 2.0, **stateless**(세션 ID 없음, `GET`/`DELETE`는 `405`)
- 인증: REST와 동일한 `Authorization: Bearer <AGENT_API_TOKEN>` 헤더
- `Content-Type: application/json` 필수
- 지원 메서드: `initialize`, `notifications/initialized`(202, 본문 없음), `ping`, `tools/list`, `tools/call`
- 지원 프로토콜 버전: `2025-06-18`, `2025-03-26`, `2024-11-05`

### 도구 목록

| 도구 | 설명 |
| --- | --- |
| `list_ports` | 로드된 포트/브리지 상태/엔티티 수 |
| `get_entities` | 정규화된 엔티티 목록 (`portId` 선택) |
| `get_entity_state` | 최신 엔티티 상태 스냅샷 |
| `get_packet_history` | parsed/command 통합 패킷 이력 |
| `get_unmatched_packets` | 미매칭 패킷 + 횟수/최초·최근 시각 |
| `analyze_packet` | 활성 또는 초안 설정으로 패킷 분석 |
| `start_capture` / `stop_capture` | 원시 패킷 캡처 제어 |
| `get_capture_status` / `list_capture_files` | 캡처 상태와 저장 파일 목록 |
| `validate_entity_draft` | 저장 없이 초안 검증 + 충돌/디스커버리 미리보기 |
| `apply_entity_draft` | `draftHash`로 초안을 YAML에 적용 + 백업 + 재시작 플래그 |
| `get_recent_events` | `afterId` 기반 이벤트 폴링 (최근 500건 버퍼, SSE 대체) |
| `send_packet` | RS485 전송. `AGENT_ALLOW_PACKET_SEND=true`일 때만 `tools/list`에 노출 |

`send_packet`이 비활성인 상태에서 직접 호출하면 `isError: true`와 `PACKET_SEND_DISABLED`가 반환됩니다. 적용 계열 도구는 REST와 동일하게 YAML 백업과 초안 해시 검증을 수행합니다.

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
      "url": "http://homeassistant.local:3000/api/v1/agent/mcp",
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
        "http://homeassistant.local:3000/api/v1/agent/mcp",
        "--header",
        "Authorization: Bearer <AGENT_API_TOKEN>"
      ]
    }
  }
}
```

HA 애드온은 Home Assistant ingress 뒤에 있으므로 외부 클라이언트에서는 애드온에 직접 접근 가능한 URL(예: 리버스 프록시 또는 `http://<HA-IP>:3000`)을 사용해야 합니다.

### 오류 매핑

- 도구 실행 오류는 JSON-RPC 오류가 아니라 `result.isError: true`와 `{ "error": "...", "message": "..." }` 구조로 반환됩니다.
- 알 수 없는 도구/잘못된 `params`는 JSON-RPC `-32602`, 알 수 없는 메서드는 `-32601`, 잘못된 요청은 HTTP 400 + `-32600`입니다.
- 인증, rate limit, 초안 해시/충돌 규칙은 REST와 동일합니다.

## 관련 문서

- [Docker 환경변수 레퍼런스](./environment-variables.md)
- [설정 개요](/config/)
- [트러블슈팅](./troubleshooting.md)
