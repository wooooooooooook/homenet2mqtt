# h2m 시스템 지도와 인터페이스 (REST · MCP)

"무엇을 어떤 문으로 할 수 있는가"를 매번 추측하지 않기 위한 지도다. 엔티티 필드 규칙은 `entity-schema.md`, 패킷 판정 규칙은 `heuristics.md`에 있고, 이 문서는 **표면(surface)과 한계**만 다룬다.

## 1. 무엇이 어디서 도는가

| 구성                 | 역할                                                                                        | 스킬에서 쓰는 것                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/core`      | RS485 ↔ MQTT 브리지 엔진. 엔티티 파싱/매칭/커맨드, 설정 스키마                             | `config/examples/*.homenet_bridge.yaml`, `static/schema/homenet-bridge.schema.json`   |
| `packages/service`   | API + 빌드된 UI 정적 서빙. UI API(`/api/*`, 세션 쿠키)와 Agent API(`/api/v1/agent`, Bearer) | REST·MCP 호출 대상                                                                    |
| `packages/ui`        | Svelte UI. 토큰 발급, 패킷 전송 허용, 로그는 여기서만                                       | 사람이 직접 해야 하는 단계의 위치                                                     |
| `packages/simulator` | 디버깅용 RS485 엔드포인트(가상 버스)                                                        | 하드웨어 없이 배선/프레이밍 연습. 실기기 검증을 대체하지 않는다                       |
| `gallery`            | 벤더별 프리셋 YAML (`list.json`/`list_new.json`은 배포 시 생성)                             | `/gallery*` API 응답 · `gallery-show` 원본 스니펫 · `gallery-expand` 펼친 초안        |
| `docs`               | VitePress 문서                                                                              | 로컬 `docs/guide/agent-api.md` 또는 배포 문서 <https://homenet2mqtt-docs.vercel.app/> |

표의 `packages/`·`gallery/`·`docs/` 경로는 **저장소 체크아웃 기준**이다. 스킬을 단독 설치한 환경에는 이 파일들이 없으므로, 같은 정보는 Agent API(`/capabilities`, `/gallery*`, `/schema*`, `/setup/examples/*`)와 `references/`로 얻는다.

- Agent API는 **UI와 다른 포트**(기본 3001)다. UI 포트(3000)의 `/api/v1/agent/*`는 `404`이고, Agent 포트는 UI 정적 파일을 서빙하지 않는다. 포트는 UI **설정 > Agent API**에서 바뀐다.
- Agent API 토글(`AGENT_API_ENABLED` / 애드온 `agent_api_enabled`)이 꺼져 있으면 **포트 자체가 열리지 않는다**. 이때는 API가 아니라 "사용자가 UI에서 켜야 하는 상태"다.
- `/api/*`(UI API)와 `/api/stream`(WebSocket)은 번들 UI 전용 표면이다. **UI 세션 쿠키**(또는 신뢰된 HA ingress 요청)가 필요하고 스키마 보장이 없으므로 **스킬은 `/api/*`를 쓰지 않는다.** 같은 정보가 필요한 경우 Agent API에 같은 목적의 엔드포인트가 있는지 먼저 본다(예: 설정 스키마는 `/api/schema/homenet-bridge`가 아니라 `/api/v1/agent/schema/homenet-bridge`).

## 2. 두 문: REST와 MCP

둘은 같은 `agent/services/*` 도메인 로직을 호출한다. MCP는 REST 위의 얇은 어댑터이므로 **어느 쪽을 써도 결과와 제약(rate limit, `draftHash`, 재시작 요구)은 같다.** 검증한 초안 해시를 다른 표면에서 그대로 써도 된다(같은 파일·같은 초안 기준).

| 상황                                    | 쓸 표면                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| 에이전트 클라이언트에 MCP 도구가 연결됨 | MCP — `tools/list`로 시작, `tools/call`로 실행            |
| 셸만 있음 / MCP 미지원 클라이언트 / CI  | REST — `scripts/h2m.mjs`                                  |
| MCP에 없는 기능(§5)                     | REST                                                      |
| 설정 스키마(필드명·enum)                | MCP `get_config_schema`(통째) 또는 REST `GET /schema*`    |
| 실시간 대기                             | REST `GET /events`(SSE) 또는 MCP `get_recent_events` 폴링 |

MCP 연결 정보다:

- 엔드포인트 `POST $H2M_URL/mcp`, JSON-RPC 2.0, **stateless**(세션 ID 없음, `GET`/`DELETE`는 `405`)
- 지원 버전 `2025-06-18` / `2025-03-26` / `2024-11-05`, 메서드 `initialize`·`notifications/initialized`(202)·`ping`·`tools/list`·`tools/call`
- 인증은 REST와 같은 `Authorization: Bearer <token>`, `Content-Type: application/json` 필수
- 도구 실행 실패는 JSON-RPC 오류가 아니라 `result.isError=true` + `{ error, message }`로 온다. 프로토콜 오류(`-32602` 등)와 구분해서 읽는다
- `send_packet`은 UI에서 패킷 전송을 허용했을 때만 `tools/list`에 나타난다 → **도구 목록 자체가 기능 토글 상태**다. 권한이 있어도 매 전송 계획마다 사용자 동의가 필요하다: `preview`(REST 전용)로 각 패킷의 최종 hex를 확정하고 대상·순서·간격을 밝혀 승인받은 뒤 `confirm: true`로 그 범위 안에서만 보낸다(1회 또는 여러 패킷 시퀀스). SKILL.md "실기기 패킷 전송"

## 3. 시작할 때 능력부터 확인한다

1. `GET /capabilities` — `serviceVersion`, `features`(`observation`, `packetAnalysis`, `packetPreview`, `packetSend`, `capture`, `events`, `draftEntities`, `setup`, `gallery`, `schema`, `backups`, `bridgeDelete`, `mcp`), `limits`(분당 120회, history 1,000건, 이벤트 버퍼 500건), `mcp.endpoint`, `links`(`openapi`, `llms`, `schema`, `mcp`)
2. MCP 클라이언트면 `tools/list` — 이 배포에서 실제로 가능한 작업 목록
3. 세부 스키마 — `GET /openapi.json`, `GET /llms.txt`(둘 다 공개, 토큰 불필요), 각 도구의 `inputSchema`
4. `node scripts/h2m.mjs info`가 `capabilities` + 포트 요약을 한 번에 출력한다

`features`에 없는 키나 `404`는 그 배포에 기능이 없다는 뜻이다. 다른 경로를 찔러보며 추측하지 말고 `serviceVersion`을 보고 §7로 내려간다.

## 4. REST 표면

`$H2M_URL` = `http://<host>:3001/api/v1/agent` (UI 포트 아님)

| 목적                 | 엔드포인트                                                                                                        | `h2m.mjs`                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 공개 문서            | `GET /openapi.json`, `GET /llms.txt`                                                                              | `get /llms.txt`                                                |
| 능력/한도            | `GET /capabilities`                                                                                               | `info`                                                         |
| 초기 설정 상태       | `GET /setup`                                                                                                      | `setup`                                                        |
| 예제 원문            | `GET /setup/examples/:filename`                                                                                   | `get /setup/examples/<file>`                                   |
| 배선 테스트          | `POST /setup/test-serial`                                                                                         | `post /setup/test-serial '<json>'`                             |
| 설정 생성/브릿지     | `POST /setup/apply` (`mode=init\|add`, 설정만 복사. ⚠️ 에이전트 `includeEntities`/`selectedEntities` 사용 금지)                     | `post /setup/apply '<json>'`                                   |
| 포트/브리지          | `GET /ports`                                                                                                      | `info`                                                         |
| 엔티티 목록          | `GET /entities?portId=`                                                                                           | `entities <portId> [--full]`                                   |
| 엔티티 단건          | `GET /entities/:entityId`                                                                                         | `get "/entities/<id>"`                                         |
| automation 목록      | `GET /automations?portId=`                                                                                        | `automations <portId>`                                         |
| automation 단건      | `GET /automations/:automationId`                                                                                  | `get "/automations/<id>"`                                      |
| script 목록          | `GET /scripts?portId=`                                                                                            | `scripts <portId>`                                             |
| script 단건          | `GET /scripts/:scriptId`                                                                                          | `get "/scripts/<id>"`                                          |
| 상태 스냅샷          | `GET /state?portId=`                                                                                              | `get /state`                                                   |
| 패킷 이력            | `GET /packets/history?portId=&limit=`                                                                             | `history <portId> [limit]`                                     |
| 미매칭               | `GET /packets/unmatched?portId=`                                                                                  | `unmatched <portId>`                                           |
| 패킷 분석(초안 포함) | `POST /packets/analyze`                                                                                           | `analyze <portId> <draft.json> <hex...>`                       |
| TX hex 미리보기      | `POST /packets/preview`                                                                                           | `preview <portId> <hex> [--header] [--footer] [--no-checksum]` |
| 패킷 전송(옵트인)    | `POST /packets/send` (`confirm: true`, `count`≤10 또는 여러 hex 시퀀스, `header`/`footer`/`checksum` 플래그)      | `send <portId> <hex> [<hex> ...] --confirm ...`                |
| 캡처 상태            | `GET /capture`                                                                                                    | `capture status`                                               |
| 캡처 시작/중지       | `POST /capture/start`, `POST /capture/stop`                                                                       | `capture start\|stop <portId> [mode]`                          |
| 캡처 파일            | `GET /capture/files`, `GET\|DELETE /capture/files/:filename`                                                      | `capture files\|get\|delete`                                   |
| 갤러리               | `GET /gallery[?vendor=]`, `/gallery/snippet?file=`, `/gallery/match`, `POST /gallery/expand`                      | `gallery`, `gallery-show`, `gallery-match`, `gallery-expand`   |
| 설정 백업            | `GET /backups?portId=&configFile=`, `POST /backups`, `GET /backups/:filename[?raw=true]`, `POST /backups/restore` | `backups list\|create\|get\|restore`                           |
| 설정(브릿지) 삭제    | `POST /bridges/delete` (`backupFilename`·`confirm: true` 필수, 백업이 현재 YAML과 일치해야 함)                    | `delete-bridge <portId\|-> --backup <filename> --confirm`      |
| 설정 스키마          | `GET /schema`, `GET /schema/:schemaName`                                                                          | `schema.mjs list`, `schema.mjs fields <type>`                  |
| 이벤트(SSE)          | `GET /events?types=&portId=&sinceId=`                                                                             | (스크립트 없음 — curl 또는 MCP)                                |
| 초안 검증            | `POST /entities/validate`                                                                                         | `validate <portId> <draft.json>`                               |
| 초안 적용            | `POST /entities/apply`                                                                                            | `apply <portId> <draft.json> <draftHash> [--restart]`          |
| MCP                  | `POST /mcp`                                                                                                       | `scripts/mcp.mjs`                                              |

`/automations`는 `{ portId, automations: [{ portId, id, name, config }] }`, `/scripts`는 `{ portId, scripts: [{ portId, id, description, config }] }`를 준다. `config`에 설정 원문이 들어 있고, 단건 경로는 같은 항목을 직접 반환한다. 없는 ID는 각각 `AUTOMATION_NOT_FOUND`/`SCRIPT_NOT_FOUND`다.

## 5. MCP 도구 (30개, `*` = 필수)

| 그룹   | 도구                                                         | 인자                                                                                                                                        |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 설정   | `get_setup_state`                                            | –                                                                                                                                           |
|        | `get_setup_example`                                          | `example*`                                                                                                                                  |
|        | `test_setup_serial`                                          | `example*`, `serialPath`, `serialConfig`                                                                                                    |
|        | `apply_initial_setup`                                        | `example*`, `mode`(`init\|add`), `portId`, `serialPath`, `serialConfig`, `packetDefaults`, `restart` (⚠️ `includeEntities`/`selectedEntities` 사용 금지) |
| 관측   | `list_ports`                                                 | –                                                                                                                                           |
|        | `get_entities` / `get_entity_state`                          | `portId`                                                                                                                                    |
|        | `get_automations` / `get_scripts`                            | `portId`                                                                                                                                    |
|        | `get_packet_history`                                         | `portId`, `limit`, `since`                                                                                                                  |
|        | `get_unmatched_packets`                                      | `portId`, `limit`                                                                                                                           |
| 패킷   | `analyze_packet`                                             | `input*`(hex 또는 int 배열), `portId`, `draft`, `similarityThreshold`                                                                       |
|        | `send_packet`                                                | `hex*`, `confirm*=true`, `portId`, `header`, `footer`, `checksum`, `count`(≤10), `interval`                                                 |
| 캡처   | `start_capture`                                              | `mode`(`all\|valid`)                                                                                                                        |
|        | `stop_capture` / `get_capture_status` / `list_capture_files` | –                                                                                                                                           |
| 갤러리 | `list_gallery`                                               | `vendor`                                                                                                                                    |
|        | `get_gallery_snippet`                                        | `file*` (`vendor/name.yaml`)                                                                                                                |
|        | `match_gallery`                                              | `portId`, `vendor`                                                                                                                          |
|        | `expand_gallery_snippet`                                     | `file*` (`vendor/name.yaml`), `parameterValues`                                                                                             |
| 스키마 | `list_config_schemas`                                        | –                                                                                                                                           |
|        | `get_config_schema`                                          | `name` (기본 `homenet-bridge`)                                                                                                              |
| 백업   | `list_backups`                                               | `portId`, `configFile`                                                                                                                      |
|        | `create_backup`                                              | `portId`, `configFile`, `reason`                                                                                                            |
|        | `get_backup`                                                 | `filename*`                                                                                                                                 |
|        | `restore_backup`                                             | `filename*`, `confirm*=true`, `restart`                                                                                                     |
|        | `delete_bridge`                                              | `portId` 또는 `configFile`, `backupFilename*`, `confirm*=true`                                                                              |
| 엔티티 | `validate_entity_draft`                                      | `entities`, `automations`, `scripts`, `packetDefaults`, `portId`, `discoveryPreview`, `similarityThreshold`                                 |
|        | `apply_entity_draft`                                         | `draftHash*`, 위 초안 필드, `portId`, `resolutions`, `renames`, `restart`                                                                   |
| 이벤트 | `get_recent_events`                                          | `afterId`, `limit`, `types`, `portId`, `rawMode`                                                                                            |

`send_packet`은 `destructiveHint` 도구다. `count` 기본값은 1이고 API 상한은 10이다. 같은 패킷 반복은 `count`/`interval`(10–1000ms)로, 서로 다른 패킷 시퀀스는 승인된 순서대로 `count: 1`씩 보낸다. `h2m.mjs send`는 여러 hex를 `--delay` 간격으로 순차 전송하며 한 호출 최대 10패킷이다. `checksum` 기본값은 `true`, `header`/`footer` 기본값은 `false`이므로 `preview`와 **같은 플래그**를 넘겨야 한다. 실패 코드: `PACKET_SEND_DISABLED`(권한 꺼짐), `CONFIRM_REQUIRED`, `INVALID_COUNT`/`INVALID_INTERVAL`, `PORT_NOT_READY`, `PACKET_BUILD_FAILED`, `RATE_LIMITED`.

### MCP에 없어서 REST로 내려와야 하는 것

- **캡처 파일 다운로드/삭제** — MCP는 목록만 준다. `variance.mjs` 분석에는 로컬 파일이 필요하므로 `h2m.mjs capture get`
- **TX 미리보기** (`POST /packets/preview`) — MCP에 preview 도구가 없다. `analyze_packet`은 RX 파싱 검증이고 커맨드 hex 생성 검증이 아니다
- **`GET /events` SSE** — MCP는 `get_recent_events` 폴링(최근 500건, `afterId` 기반)
- **원문 문서** — `openapi.json`, `llms.txt`, `GET /setup/examples/:filename` 전체 YAML
- **스키마 잘라 읽기** — MCP `get_config_schema`는 스키마 **문서 전체**(약 120KB)를 준다. 필드명·enum만 빠르게 확인하려면 REST `schema.mjs fields <type>`(정의 단위 절단)이 낫다
- **엔티티/automation/script 단건 조회** — MCP는 목록만 준다. 단건은 REST `GET /entities/:entityId`, `GET /automations/:automationId`, `GET /scripts/:scriptId`

> 캡처는 **포트별 기능이 아니다**. 두 표면 모두 서비스 전역 `rawPacketLogger` 하나를 쓰고, `h2m.mjs capture start <portId>`가 보내는 `portId`는 서버가 무시한다(파일 메타에는 첫 포트의 serial만 기록). 멀티포트에서 포트를 골라 찍는 방법은 없다.

## 6. API로 할 수 없는 것 — 사용자에게 요청한다

| 원하는 것                                          | 왜 안 되나                                                                                            | 대신                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Agent API 켜기 / 토큰 발급 / 포트 변경 / 전송 허용 | UI **설정 > Agent API**에서만. 토큰 평문은 발급 화면에서 1회만 표시                                   | 사용자에게 UI에서 켜고 발급 요청(`references/connection-setup.md`). 받은 토큰을 문서·로그·커밋에 남기지 않는다 |
| MQTT 브로커 주소·계정                              | config가 아니라 환경변수/애드온 옵션                                                                  | 사용자에게 환경변수·애드온 옵션 수정 요청                                                                      |
| 애드온 포트 매핑(`3001/tcp`)                       | 애드온 네트워크 설정                                                                                  | HA 애드온 설정에서 매핑 변경 요청                                                                              |
| 서비스 로그 라인                                   | Agent API에 로그 조회가 없다(`/events`는 패킷·상태·브리지 이벤트)                                     | UI 로그 화면 확인 요청                                                                                         |
| 백업 파일 삭제/정리                                | Agent API는 백업 파일의 목록·생성·다운로드·복원만 제공하고 삭제는 없다(설정 삭제는 `/bridges/delete`) | UI 백업 관리에서 정리 요청                                                                                     |
| 설정 파일 직접 편집                                | 파일 쓰기는 `entities/apply`·`setup/apply` 경로만                                                     | 초안으로 표현 가능한 것만 API로, 나머지는 로컬 편집 후 사용자에게 적용 안내                                    |
| 월패드에서 조작 가능한 기기 목록                   | 설치 대수·채널 배치는 API에 없다(갤러리 개수 파라미터는 허용 상한)                                    | 사용자에게 실물 목록 요청 → 그 기기·채널만 확장하고 조작 요청                                                  |
| 실기기 조작(월패드·스위치·리모컨)                  | 물리 행위                                                                                             | SKILL.md "트래픽 확보" 절의 조작 요청                                                                          |
| 등록된 엔티티의 command 실행                       | Agent API에 커맨드 실행 엔드포인트가 없다                                                             | 사용자가 HA/MQTT/월패드에서 실행하거나, 승인 후 같은 payload를 `/packets/send`로 보낸다                        |

`entities/apply`는 초안의 `automations`를 설정 파일의 `automation` 키에, `scripts`를 `scripts` 키에 기록한다(엔티티와 같은 파일). 적용은 여전히 **전체 재시작**을 요구하며, 재시작 전에는 automation이 등록되지 않는다.

## 7. 배포 버전 차이

- `/capabilities.features`에 없는 키 = 그 배포에 없는 기능. `mcp: false`/`404`면 REST만 쓴다
- 갤러리 응답의 `source=local`은 GitHub 조회 실패로 동봉 프리셋을 쓴 것이다 → 리비전이 낮을 수 있으니 바이트는 라이브 설정에서 복사
- `/gallery` 자체가 없으면 그 배포는 갤러리 확장을 지원하지 않는다 → 폴백 역산으로 넘어간다
- `/gallery/expand`가 `404`면 `$repeat`/`{{i}}` 서버 펼침이 없는 버전이다 → `gallery-show` 원문을 직접 펼친다. `expand` 응답의 `draft`는 설정에 쓰이지 않으므로, 반영은 항상 `/entities/validate`→`/entities/apply`다
- `/backups`가 `404`면 그 배포는 백업 조회·복원 API가 없다(`apply`는 자체 백업만 만든다). 로컬 체크아웃이면 파일시스템, 아니면 사용자에게 복원을 요청한다
- `/bridges/delete`가 `404`면 그 배포에는 브릿지 삭제 API가 없다. 파일을 직접 지우지 말고 UI 브릿지 관리에서 삭제를 요청한다
- `features.packetSend`가 없거나 `false`면 전송 API가 비활성이다(구버전이거나 UI 설정이 꺼짐). `preview`는 `features.packetPreview`로 따로 확인하고, 전송이 필요하면 사용자에게 UI에서 허용을 요청한다
- `/schema`가 `404`면 그 버전에는 스키마 노출이 없다. `references/entity-schema.md`의 요약으로 초안을 만들고 `validate`의 오류 메시지로 필드명을 교정한다
- 개발 체크아웃에서는 `docs/guide/agent-api.md`가 그 버전의 정본이다. 문서와 라이브 `capabilities`가 어긋나면 **라이브가 우선**이고, 문서를 고칠 대상으로 보고한다
- 저장소 `docs/`가 없으면 배포 문서 <https://homenet2mqtt-docs.vercel.app/>에서 해당 페이지만 읽는다(예: `/guide/agent-api.html`, `/guide/agent-skills.html`). 배포 문서는 최신 main 기준이므로 설치 버전과 다를 수 있다

## 8. 요청 유형 → 첫 호출

| 사용자 요청                  | 첫 호출                                     | 이어서                                                                                                   |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "지금 상태 알려줘"           | `capabilities` + `ports` / `list_ports`     | `state` / `get_entity_state`, `packets/history`                                                          |
| "이 엔티티 왜 안 보여"       | `entities --full`                           | `unmatched` → `analyze`                                                                                  |
| "엔티티 추가해줘"            | `gallery-match` → `gallery-expand`          | `analyze` → `validate` → 승인 → `apply`                                                                  |
| "패킷이 안 잡혀"             | `capture wait`                              | 조작 요청 → `capture`                                                                                    |
| "설정이 비어 있어"           | `setup`                                     | `setup/examples` → `test-serial` → `setup/apply`                                                         |
| "포트/브릿지 하나 더 붙여줘" | `setup` (`loadedPortIds`)                   | `test-serial` → `setup/apply mode=add`                                                                   |
| "커맨드가 이상해"            | `packets/preview`(REST 전용)                | `history`의 TX hex와 대조                                                                                |
| "이 패킷이 실제로 먹히나"    | `preview`로 각 최종 hex 확정                | 대상·순서·간격을 밝혀 승인 → `send --confirm`(승인된 1회/시퀀스) → 사용자 동작 확인 + `history`/`state`  |
| "갤러리에 뭐가 있어"         | `gallery`                                   | `gallery <vendor>`(`auto=`/`scripts=`) → `gallery-show`                                                  |
| "자동화/스크립트 붙여줘"     | `automations <portId>` + `scripts <portId>` | `gallery-expand`의 `draft.automations`/`draft.scripts` → `validate`(counts) → 승인 → `apply` → `/events` |
| "이 필드명/값이 맞나"        | `schema.mjs fields <type>`                  | `--desc` → `def <Def>` → `validate`. MCP면 `get_config_schema`                                           |
| "방금 설정 되돌려줘"         | `backups list <portId>`                     | `backups get <filename>`로 원본 확인 → 승인 → `backups restore <filename>`(재시작)                       |
| "브릿지/설정 삭제해줘"       | `backups create <portId> before_delete`     | 원본 YAML 확보 → `delete-bridge <portId> --backup <filename> --confirm`(재시작, 마지막이면 설정 마법사)  |
| "방금 무슨 일 있었어"        | `get_recent_events` / `events`              | `packets/history`                                                                                        |
| "MQTT/토큰/포트 설정 바꿔줘" | §6                                          | 사용자 요청 또는 UI 안내                                                                                 |
