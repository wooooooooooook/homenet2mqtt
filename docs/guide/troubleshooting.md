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
  - `packet_defaults`의 `rx_header`가 정확한지 확인하세요. 설정된 헤더와 일치하지 않는 패킷은 모두 무시됩니다.

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

## 문의 및 지원

[GitHub Issues](https://github.com/wooooooooooook/homenet2mqtt/issues)

[Discord](https://discord.gg/kGwhUBMe5z)
