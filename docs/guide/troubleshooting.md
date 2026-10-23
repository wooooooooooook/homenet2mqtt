# 자주 묻는 질문 (Troubleshooting)

## 빠른 점검 순서

1. [환경변수 레퍼런스](./environment-variables.md) 기준으로 `MQTT_URL`, `CONFIG_FILES`, `LOG_LEVEL` 값을 먼저 확인합니다.
2. 로그 레벨을 `debug`로 올려 실제 에러 코드를 확인합니다.
3. 아래 에러 코드 표에서 원인과 조치 방법을 따라 점검합니다.

## 에러 코드 기반 진단표

| 에러 코드 | 의미 | 주요 원인 | 즉시 조치 |
|---|---|---|---|
| `SERIAL_PATH_MISSING` | serial.path 누락 | YAML 설정 누락/오타 | 설정 파일의 `serial.path` 확인 |
| `SERIAL_PATH_NOT_FOUND` | 장치 경로를 찾을 수 없음 | `/dev/ttyUSB0` 미존재, 장치 미인식 | 실제 장치 경로 재확인, 컨테이너 장치 매핑 확인 |
| `SERIAL_PERMISSION_DENIED` | 장치 접근 권한 부족 | 권한/그룹 미설정 | `dialout` 그룹 및 권한 확인 |
| `SERIAL_PORT_BUSY` | 포트 사용 중 | 다른 프로세스가 점유 | 점유 프로세스 종료 후 재시작 |
| `SERIAL_HOST_NOT_FOUND` | TCP-Serial 호스트 해석 실패 | IP/호스트명 오타 | `serial.path`의 호스트 재확인 |
| `SERIAL_CONNECTION_REFUSED` | TCP 연결 거부 | 포트 미오픈/방화벽 | EW11/변환기 포트 상태 확인 |
| `SERIAL_CONNECTION_TIMEOUT` | TCP 연결 시간 초과 | 네트워크 지연/장치 응답 없음 | 네트워크 확인, 타임아웃 상향 |
| `MQTT_AUTH_FAILED` | MQTT 인증 실패 | 계정/비밀번호 오류 | `MQTT_USER`, `MQTT_PASSWD` 재확인 |
| `MQTT_CONNECT_FAILED` | MQTT 연결 실패 | 주소/포트/브로커 상태 문제 | `MQTT_URL` 및 브로커 상태 확인 |
| `MQTT_DISCONNECTED` | MQTT 연결 끊김 | 브로커 재시작/네트워크 불안정 | 브로커 로그 확인, 자동 재연결 상태 점검 |

## 1. "Permission denied" 또는 시리얼 포트 열기 실패

- **증상**: Docker 컨테이너 로그에 `Error: Permission denied, cannot open /dev/ttyUSB0` 와 같은 에러가 발생합니다.
- **해결**:
  - 리눅스 호스트의 경우 사용자가 `dialout` 그룹에 포함되어 있는지 확인하세요.
  - Docker 실행 시 `--device /dev/ttyUSB0:/dev/ttyUSB0` 옵션을 정확히 사용했는지 확인하세요.
  - Synology NAS 등 일부 환경에서는 USB 드라이버 설치가 필요할 수 있습니다.

## 2. MQTT 연결 실패

- **증상**: `Connection refused` 또는 `Not authorized` 에러 발생.
- **해결**:
  - Home Assistant 애드온 사용 시: 별도의 설정 없이 자동으로 연결되지만, 실패한다면 애드온 설정에서 `username`/`password`를 확인하세요.
  - Docker 사용 시: `MQTT_URL`이 정확한지 확인하세요. (예: `mqtt://192.168.1.100:1883`). `localhost`는 컨테이너 자신을 가리키므로, 호스트 IP를 입력해야 할 수 있습니다.

## 3. 패킷이 전혀 들어오지 않음

- **증상**: 로그에 패킷 수신 기록이 없음.
- **해결**:
  - RS485 선의 A/B (또는 +, -) 극성이 바뀌지 않았는지 확인해보세요.
  - 월패드 제조사에 맞는 Serial 설정(Baud rate 등)이 맞는지 확인하세요.
  - `유효패킷만보기`를 체크 해제했을 때만 패킷이 보인다면 `packet_defaults`의 `rx_header`가 정확한지 확인하세요. 설정된 헤더와 일치하지 않는 패킷은 모두 무시됩니다.


## 3.1. RS485/MQTT 장애 자동 재시작

- **동작**: RS485 시리얼 최초 연결 실패, TCP-Serial 재연결 상태 지속, MQTT 연결 실패/끊김이 설정한 시간 동안 복구되지 않으면 서비스가 자동 재시작됩니다.
- **기본값**: 웹 UI **[설정] → [장애 자동 재시작]**에서 켜져 있으며, 기본 대기 시간은 `5분`입니다.
- **설정 방법**: 같은 설정 화면에서 자동 재시작 사용 여부와 재시작 대기 시간(1~1440분)을 변경할 수 있습니다.
- **참고**: 네트워크가 짧게 끊겼다가 설정 시간 안에 MQTT 또는 RS485 연결이 복구되면 예약된 자동 재시작은 취소됩니다.

## 4. 로그 레벨 변경 및 디버깅 (Debugging)

- **설명**: 문제가 발생했을 때 상세한 로그를 확인하면 원인을 파악하기 쉽습니다.
- **방법**:
  - Docker Compose: `docker-compose.yml`에서 `LOG_LEVEL: debug`로 변경하고 컨테이너를 재시작합니다.
  - Home Assistant Add-on: 애드온의 **[구성(Configuration)]** 탭에서 `log_level`을 `debug`로 변경합니다.
  - **확인할 내용**: 로그에서 `[Raw Packet]`으로 시작하는 라인을 확인하여 패킷이 실제로 들어오는지, 깨져서 들어오는지 확인합니다.

## 5. 웹 UI 접속 불가

- **증상**: 브라우저에서 `http://IP:3000` 접속이 안 됨.
- **해결**:
  - Docker 사용 시 `ports: - "3000:3000"` 매핑이 되어 있는지 확인하세요.
  - 방화벽(UFW, 시놀로지 방화벽 등)에서 3000번 포트가 허용되어 있는지 확인하세요.
  - 브라우저의 광고 차단 확장 프로그램이 간혹 웹소켓 연결을 차단할 수 있습니다. 시크릿 모드에서 시도해보세요.

## 6. UI 로그인/비밀번호 문제 {#ui-password-reset}

- **로그인 화면이 계속 표시됨**: 브라우저 쿠키가 차단되어 세션이 유지되지 않을 수 있습니다. 시크릿 모드나 쿠키 허용 설정에서 다시 시도하세요. 서비스 재시작 시 메모리 세션이 초기화되므로 다시 로그인해야 합니다.
- **비밀번호 분실**: 저장된 비밀번호를 복구할 수는 없습니다. `ui-auth.json`을 삭제하고 서비스를 재시작하면 첫 접속에서 새 비밀번호를 설정할 수 있습니다. 호스트 파일에 접근할 수 있는 사용자만 수행할 수 있습니다.
  1. 서비스를 중지합니다.
  2. 설정 디렉터리의 `ui-auth.json`을 삭제합니다.
  3. 서비스를 시작하고 UI에서 새 비밀번호를 설정합니다. Docker는 재시작 후 15분 이내에 설정해야 합니다.
  - Docker: `rm ./h2m-config/ui-auth.json && docker compose restart`
  - Home Assistant 애드온: 애드온 **중지** → `/config/homenet2mqtt/ui-auth.json` 삭제(Samba, File Editor, SSH) → 애드온 **시작**
  - 새 비밀번호를 설정하기 전까지는 3000 포트에 접근 가능한 누구나 비밀번호를 선점할 수 있습니다. Docker는 컨테이너 시작 후 15분 동안만 최초 설정이 허용되며, 시간이 지나면 설정이 차단됩니다. 재설정 즉시 완료하고, 직접 접속 포트는 외부에 노출하지 마세요.
- **인증 파일 손상/읽기 실패**: `ui-auth.json`을 읽을 수 없거나 형식이 손상되면 서비스는 **fail-closed**로 동작합니다. 로그인과 비밀번호 설정이 차단되고 UI에는 복구 안내가 표시되며 API는 `503 UI_AUTH_UNAVAILABLE`을 반환합니다. Home Assistant ingress 접속은 계속 사용할 수 있습니다. 위 비밀번호 분실 절차와 동일하게 파일을 삭제하거나 복구한 뒤 서비스를 재시작하세요.
- **`403 UI_SETUP_EXPIRED`**: Docker 환경에서 컨테이너 시작 후 15분이 지나 최초 비밀번호 설정이 차단된 상태입니다. `docker compose restart`로 재시작한 뒤 15분 이내에 비밀번호를 설정하세요. 이미 비밀번호가 설정된 경우에는 비밀번호 변경에 영향을 주지 않습니다.
- **`429 RATE_LIMITED`**: 로그인/비밀번호 변경 시도가 15분에 10회를 초과했습니다. 15분 후 다시 시도하세요.
- **`401 UI_AUTH_REQUIRED` / `UI_SETUP_REQUIRED`**: UI API가 인증을 요구하는 정상 응답입니다. 페이지를 새로고침하면 로그인 또는 최초 비밀번호 설정 화면이 표시됩니다.
- **Home Assistant ingress에서는 비밀번호를 묻지 않음**: ingress 접속은 Home Assistant 로그인으로 인증되므로 정상 동작입니다. 직접 URL(`http://<HA-IP>:3000`)로 접속할 때만 비밀번호가 필요합니다.
- **Agent API가 404**: Agent API는 UI 포트(3000)가 아니라 전용 포트(기본 3001)에서 제공됩니다. 주소를 `http://<호스트>:3001/api/v1/agent/...`로 변경하세요. 실제 포트는 UI의 **설정 → 애플리케이션 관리 → Agent API**와 기동 로그에서 확인할 수 있습니다.
- **`503 AGENT_API_DISABLED`**: 응답의 `reason`을 확인하세요. `env_disabled`는 애드온 옵션/Docker의 `AGENT_API_ENABLED`가 꺼진 상태, `no_token`은 아직 UI에서 토큰을 발급하지 않은 상태, `store_unavailable`은 `agent-api.json`이 손상되어 에이전트 API만 fail-closed로 차단된 상태입니다. 포트가 열려 있는데 `ECONNREFUSED`라면 토글이 꺼져 포트 자체가 닫혀 있는지 확인하세요.
- **포트가 이미 사용 중**: 에이전트 API는 다음 빈 포트(최대 +9)로 자동 이동하고 UI와 Matter 브리지는 그대로 동작합니다. 설정 화면에 요청 포트와 실제 바인딩 포트가 다르면 경고가 표시됩니다. Docker에서 컨테이너 내부 포트가 바뀌었다면 `ports:` 매핑도 함께 수정하세요.
- **MQTT 애드온에서 포트가 변경되지 않음**: 정상입니다. MQTT 애드온의 에이전트 포트는 애드온 **네트워크(Network)** 섹션의 `3001/tcp` 매핑으로 결정되며 UI 입력란은 숨겨집니다.
- **`agent-api.json` 손상**: 이 파일을 삭제하면 토큰이 사라집니다. 서비스를 재시작한 뒤 **설정 → Agent API**에서 토큰을 재발급해야 하고, 이전 토큰으로 접속하던 에이전트는 모두 갱신해야 합니다.

## 7. 명령은 잘 되는데 상태 반영이 안 됨

- **증상**: 스위치 제어 등 명령은 정상적으로 수행되나, 웹 UI나 Home Assistant에서 상태(On/Off 등)가 업데이트되지 않습니다.
- **원인**: 설정 파일의 `state` 스키마와 실제 기기가 보내는 패킷 구조가 일치하지 않을 가능성이 매우 높습니다.
- **해결**:
  1. 웹 UI에서 **[분석] - [raw패킷로그]** 메뉴로 이동합니다.
  2. **[녹화]** 버튼을 누른 후, 실제 장치(벽패드, 조명 스위치 등)를 직접 조작합니다.
  3. 조작이 끝난 후 **[중지]**를 눌러 패킷을 파일로 저장합니다.
  4. 저장된 패킷의 내용을 현재 설정(`state` 부분)과 비교합니다. [State/Command 스키마 가이드](../config/schemas.md)를 참고하여 패킷의 구조가 올바른지 확인하세요.
  - **AI 도움받기**: 캡처된 패킷과 설정 파일을 [Homenet2MQTT AI 가이드(DeepWiki)](https://deepwiki.com/wooooooooooook/homenet2mqtt)에 붙여넣어 분석 도움을 요청할 수 있습니다.


## 문의 및 지원

[GitHub Issues](https://github.com/wooooooooooook/homenet2mqtt/issues)

[Discord](https://discord.gg/kGwhUBMe5z)
