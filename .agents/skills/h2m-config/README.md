# h2m-config — Homenet2MQTT 엔티티 설정 스킬

Homenet2MQTT(h2m)의 Agent API를 사용해 RS485 홈넷 디바이스 엔티티(climate/light/sensor/fan/switch)와 필요한 automation/scripts를 조사·추가·검증·적용하는 에이전트 스킬입니다. 특정 에이전트 제품에 종속되지 않으며, `SKILL.md`를 읽을 수 있는 스킬 지원 에이전트(Claude Code, Codex, Cursor, Qoder 등)에서 사용할 수 있습니다.

갤러리 프리셋의 automation/scripts(주기 폴링, 버스 대리응답, 벨/엘리베이터 시퀀스, 복합 TX 패킷 생성)는 엔티티 동작의 일부입니다. 이 스킬은 엔티티만 옮기고 끝내지 않고, 필요한 automation/scripts를 같은 초안에 넣는 절차를 안내합니다.

전체 문서는 <https://homenet2mqtt-docs.vercel.app/>에서 볼 수 있습니다. 스킬 범위를 넘는 UI·설치·고급 설정 안내가 필요하면 해당 페이지만 참조하세요.

## 요구 사항

- h2m 인스턴스에서 **Agent API가 켜져 있어야** 합니다(기본 포트 `3001`). API가 꺼져 있으면 포트 자체가 열리지 않습니다.
- UI **설정 > Agent API**에서 발급한 Bearer 토큰
- Node.js 18 이상 (내장 `fetch` 사용, 외부 의존성 없음)

처음 연결하는 사용자라면 설치 형태별 주소와 토큰 발급 방법이 정리된 [`references/connection-setup.md`](./references/connection-setup.md)를 먼저 보세요.

## 설치

### 1. `skills` CLI (권장)

[`skills`](https://www.npmjs.com/package/skills) CLI는 여러 에이전트의 스킬 디렉터리를 자동으로 감지합니다.

```bash
# 저장소에서 이 스킬만 설치 (대상 에이전트는 대화형으로 선택)
npx skills add woooooooooooook/homenet2mqtt --skill h2m-config

# 설치 위치와 에이전트를 명시 (프로젝트 범위)
npx skills add woooooooooooook/homenet2mqtt --skill h2m-config -a claude-code qoder cursor

# 사용자 범위(~/.<agent>/skills)에 설치
npx skills add woooooooooooook/homenet2mqtt --skill h2m-config -g -a qoder

# 심볼릭 링크 대신 파일을 복사
npx skills add woooooooooooook/homenet2mqtt --skill h2m-config --copy
```

설치 가능한 스킬 이름은 `npx skills add woooooooooooook/homenet2mqtt --list`로 확인할 수 있습니다.

### 2. 수동 복사

`h2m-config` 폴더 **전체**(`SKILL.md`, `references/`, `scripts/`)를 사용하는 에이전트의 스킬 디렉터리에 복사합니다.

| 스코프   | 공통                | Claude Code         | Qoder              |
| -------- | ------------------- | ------------------- | ------------------ |
| 프로젝트 | `.agents/skills/`   | `.claude/skills/`   | `.qoder/skills/`   |
| 사용자   | `~/.agents/skills/` | `~/.claude/skills/` | `~/.qoder/skills/` |

예:

```bash
mkdir -p .agents/skills
cp -R <repo>/.agents/skills/h2m-config .agents/skills/
```

스킬 폴더만 복사해도 동작합니다. 이 스킬은 로컬 저장소의 `packages/`·`gallery/`에 접근하지 않고 Agent API만 사용합니다.

## 연결 설정

에이전트를 실행하는 환경에 두 변수를 설정합니다.

```bash
export H2M_URL="http://<H2M-HOST>:3001/api/v1/agent"
export H2M_TOKEN="<설정 > Agent API에서 발급한 토큰>"
```

- `H2M_URL`은 **Agent API 전용 포트**입니다. UI 포트(기본 `3000`)가 아닙니다.
- 홈넷이 없는 환경에서 연결만 확인하려면 `H2M_URL`에 대해 `GET /openapi.json`(토큰 불필요)을 호출합니다.

설치 확인:

```bash
cd <skill-dir>
node scripts/h2m.mjs info
```

포트·적용 예제·패킷 기본값이 출력되면 연결이 정상입니다.

## 주요 기능

| 파일                   | 역할                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `SKILL.md`             | 전체 작업 절차. 라이브 설정 → 갤러리 → 예제 → 패킷 역산 순서의 방법론                  |
| `scripts/h2m.mjs`      | Agent API REST 래퍼 (조회·분석·검증·적용·캡처·갤러리·백업·브릿지 삭제·승인 후 전송)    |
| `scripts/schema.mjs`   | 설정 스키마를 필드 단위로 조회                                                         |
| `scripts/mcp.mjs`      | MCP Streamable HTTP 클라이언트 (`tools`, `call`)                                       |
| `scripts/probe.mjs`    | 신규 환경에서 예제별 프레이밍/체크섬을 채점해 초기 예제 후보 순위화                    |
| `scripts/variance.mjs` | 캡처 로그의 변동 바이트 분석                                                           |
| `references/`          | 연결 안내, 엔티티 필드, automation/scripts 패턴, 판정 휴리스틱, REST/MCP 인터페이스 표 |

## 보안

- 토큰을 채팅, 이슈, 커밋, 로그, URL에 남기지 마세요.
- Agent API 포트(기본 `3001`)를 인터넷에 직접 노출하지 마세요. 원격 접근에는 인증이 있는 리버스 프록시를 사용하세요.
- `/packets/send`는 실제 버스에 트래픽을 보내는 옵트인 기능입니다. 스킬은 전송 권한이 있어도 `preview`로 hex를 확정하고 대상·순서·간격을 밝혀 사용자 승인을 받은 뒤 승인된 계획(1회 또는 여러 패킷 시퀀스)대로만 전송하며, 전송 후 실기기 동작 확인을 요청합니다. 탐색·채널 스캔 목적의 전송은 하지 않습니다.
- `entities/apply`는 설정 파일을 변경하고 서비스를 재시작합니다. 적용 전에 검증(`validate`)과 사용자 승인을 거칩니다.
- 브릿지 삭제는 `backups create`로 현재 YAML을 먼저 백업하고 그 `filename`을 넘겨야만 동작합니다. 백업 이후 YAML이 바뀌면 거부되며, 삭제는 서비스를 재시작하고 마지막 설정이면 초기 설정 마법사를 다시 엽니다.

## 업데이트와 제거

```bash
npx skills update h2m-config
npx skills remove h2m-config
```

수동 설치했다면 해당 스킬 디렉터리를 교체하거나 삭제하면 됩니다.

## 라이선스

이 저장소의 라이선스(MIT)를 따릅니다.
