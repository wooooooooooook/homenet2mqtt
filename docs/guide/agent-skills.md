# AI 에이전트 스킬 설치

Homenet2MQTT는 에이전트가 설정을 직접 조사하고 디바이스 엔티티를 추가할 수 있도록 [`h2m-config`](https://github.com/wooooooooooook/homenet2mqtt/tree/main/.agents/skills/h2m-config) 스킬을 제공합니다. 이 스킬은 특정 에이전트 제품 전용이 아니라 `SKILL.md`를 읽는 스킬 지원 에이전트(Claude Code, Codex, Cursor, Qoder 등)에서 공통으로 사용할 수 있습니다.

스킬이 하는 일:

- Agent API로 포트·적용 예제·기존 엔티티·미매칭 패킷을 조사
- 벤더 갤러리 프리셋과 예제 설정을 근거로 엔티티 초안 작성
- 갤러리로 설명되지 않는 디바이스만 원시 RS485 패킷을 분석해 역산
- 초안 검증(`validate`) → 사용자 승인 → 적용(`apply`) → 재시작 후 재확인

## 준비물

- **Agent API가 켜진 h2m 인스턴스** — 기본 포트 `3001`. 꺼져 있으면 포트 자체가 열리지 않습니다.
- **Bearer 토큰** — UI **설정 > Agent API**에서 발급합니다. 평문은 한 번만 표시됩니다.
- **Node.js 18 이상** — 스킬 스크립트가 내장 `fetch`를 사용하며 외부 의존성은 없습니다.

API 활성화·토큰 발급·설치 형태별 주소는 [AI 에이전트용 API](./agent-api.md)를 참고하세요. 주소를 전혀 모르는 사용자라면 스킬 설치 후 에이전트에게 "h2m 연결부터 도와줘"라고 요청해도 됩니다.

## 설치 — `skills` CLI

[`skills`](https://www.npmjs.com/package/skills) CLI는 여러 에이전트의 스킬 디렉터리를 자동으로 감지합니다. 별도 전역 설치 없이 `npx`로 실행할 수 있습니다.

```bash
# 저장소의 스킬 목록 확인
npx skills add woooooooooook/homenet2mqtt --list

# h2m-config만 설치 (대상 에이전트는 대화형으로 선택)
npx skills add woooooooooook/homenet2mqtt --skill h2m-config

# 에이전트를 명시해 프로젝트 범위에 설치
npx skills add woooooooooook/homenet2mqtt --skill h2m-config -a claude-code qoder cursor

# 사용자 범위(~/.<agent>/skills)에 설치
npx skills add woooooooooook/homenet2mqtt --skill h2m-config -g -a qoder

# 심볼릭 링크 대신 파일을 복사
npx skills add woooooooooook/homenet2mqtt --skill h2m-config --copy
```

- `-a`에 지정할 수 있는 에이전트 이름은 설치된 `skills` 버전의 안내를 따릅니다. 생략하면 대화형 선택입니다.
- `--all`은 저장소의 모든 스킬을 감지된 모든 에이전트에 설치하므로, 이 저장소에서는 `--skill h2m-config`를 명시하는 편이 안전합니다.

## 설치 — 수동 복사

CLI를 쓰지 않아도 됩니다. `h2m-config` 폴더 **전체**(`SKILL.md`, `references/`, `scripts/`)를 사용하는 에이전트의 스킬 디렉터리에 복사합니다.

| 스코프   | 공통                | Claude Code         | Qoder              |
| -------- | ------------------- | ------------------- | ------------------ |
| 프로젝트 | `.agents/skills/`   | `.claude/skills/`   | `.qoder/skills/`   |
| 사용자   | `~/.agents/skills/` | `~/.claude/skills/` | `~/.qoder/skills/` |

예:

```bash
mkdir -p .agents/skills
cp -R /path/to/homenet2mqtt/.agents/skills/h2m-config .agents/skills/
```

스킬 폴더만 복사해도 동작합니다. 스킬은 로컬 저장소의 `packages/`·`gallery/`를 읽지 않고 Agent API만 사용합니다.

## 연결 설정

에이전트를 실행하는 환경에 두 변수를 설정합니다.

```bash
export H2M_URL="http://<H2M-HOST>:3001/api/v1/agent"
export H2M_TOKEN="<설정 > Agent API에서 발급한 토큰>"
```

- `H2M_URL`은 **Agent API 전용 포트**입니다. UI 주소(기본 `3000`)가 아닙니다.
- 애드온·Docker·직접 실행에 따라 호스트와 포트가 다릅니다. 설치 형태별 표는 스킬의 `references/connection-setup.md`에 있습니다.
- 토큰 없이 연결만 확인하려면 `GET $H2M_URL/openapi.json`을 호출합니다.

설치 확인:

```bash
cd <skill-dir>
node scripts/h2m.mjs info
```

포트·적용 예제·패킷 기본값이 출력되면 연결이 정상입니다.

## 사용 예시

설치 후 에이전트에게 자연어로 요청하면 됩니다.

- "이 h2m 설정에 없는 디바이스를 붙여줘"
- "미매칭 패킷을 정리해줘"
- "갤러리 프리셋으로 난방 채널을 늘려줘"
- "패킷이 안 잡히는데 월패드에서 뭘 조작해야 하나?"
- "h2m 주소를 모르겠어. 연결부터 도와줘"

에이전트는 먼저 **월패드·벽면 스위치에서 실제로 조작 가능한 기기 목록**을 요청합니다. 갤러리의 개수 파라미터는 허용 상한일 뿐 설치 대수가 아니므로, 실물 목록을 기준으로 확장 범위를 정합니다.

## 업데이트와 제거

```bash
npx skills update h2m-config
npx skills remove h2m-config
```

수동 설치했다면 해당 스킬 디렉터리를 교체하거나 삭제하면 됩니다.

## 보안

- 토큰을 채팅, 이슈, 커밋, 로그, URL에 남기지 마세요.
- Agent API 포트(기본 `3001`)를 인터넷에 직접 노출하지 마세요. 원격 접근에는 인증이 있는 리버스 프록시를 사용하세요.
- `/packets/send`는 실제 버스에 트래픽을 보내는 옵트인 기능입니다. 실기기가 연결된 버스에서 테스트 목적으로 남용하지 마세요.
- `entities/apply`는 설정 파일을 변경하고 서비스를 재시작합니다. 에이전트는 적용 전에 검증 결과와 재시작 영향을 알리고 승인을 받아야 합니다.

## 관련 문서

- [AI 에이전트용 API](./agent-api.md)
- [Docker 환경변수 레퍼런스](./environment-variables.md)
- [트러블슈팅](./troubleshooting.md)
- [스킬 소스와 설치 안내 (GitHub)](https://github.com/wooooooooooook/homenet2mqtt/tree/main/.agents/skills/h2m-config)
