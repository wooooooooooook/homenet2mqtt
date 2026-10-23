# Docker 환경변수 레퍼런스

> 이 문서는 Homenet2MQTT 운영 시 사용하는 주요 환경변수를 한 곳에서 정리합니다.

## 공통 환경변수

| 변수                | 기본값                                             | 설명                                                  | 사용처               |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------- | -------------------- |
| `CONFIG_FILES`      | (비어있음, 권장)                                     | 로드할 설정 파일 목록(쉼표 구분). 비워두면 폴더 내의 모든 `homenet_bridge` 설정 파일을 자동으로 탐색하여 로드합니다. | Add-on, Docker       |
| `CONFIG_ROOT`       | `/config` (Docker) / `packages/core/config` (로컬) | 설정 파일 루트 경로                                   | Add-on, Docker, 로컬 |
| `MQTT_URL`          | `mqtt://localhost:1883`                            | MQTT 브로커 주소                                      | Add-on, Docker, 로컬 |
| `MQTT_NEED_LOGIN`   | `false`                                            | MQTT 인증 사용 여부                                   | Docker               |
| `MQTT_USER`         | `''`                                               | MQTT 사용자명                                         | Docker               |
| `MQTT_PASSWD`       | `''`                                               | MQTT 비밀번호                                         | Docker               |
| `MQTT_TOPIC_PREFIX` | `homenet2mqtt`                                     | MQTT 토픽 접두사                                      | Add-on, Docker, 로컬 |
| `PORT`              | `3000`                                             | UI 포트 (정적 파일, UI API, WebSocket)                | Add-on, Docker, 로컬 |
| `AGENT_API_ENABLED` | `false`                                            | AI 에이전트 API 사용 토글. `true`일 때 UI에서 설정한 전용 포트(기본 3001)가 열립니다. | Add-on, Docker, 로컬 |
| `LOG_LEVEL`         | `info`                                             | 로그 레벨 (`trace`, `debug`, `info`, `warn`, `error`) | Add-on, Docker, 로컬 |
| `TIMEZONE`          | 시스템 기본값                                      | 런타임 타임존                                         | Add-on, Docker, 로컬 |
| `DISCOVERY_ENABLED` | `false`                                            | Home Assistant Discovery 활성화 여부                  | Docker               |
| `INTEGRATION_TYPE`  | `mqtt`                                             | 연동 모드 결정 (`mqtt`, `matter`, `log`)              | Add-on, Docker       |

::: info 에이전트 토큰·포트·패킷 전송은 환경변수가 아닙니다
`AGENT_API_ENABLED`는 순수 on/off 스위치일 뿐입니다. 에이전트 Bearer 토큰(자동 생성), 에이전트 API 포트, RS485 패킷 전송 허용 여부는 모두 웹 UI의 **설정 > Agent API** 화면에서 관리하며 `CONFIG_ROOT/agent-api.json`(SHA-256 해시, 권한 0600)에 저장됩니다. Home Assistant MQTT 애드온에서는 에이전트 포트가 애드온의 네트워크 포트 매핑(`3001/tcp`)로 결정되므로 UI에서 변경할 수 없고, `host_network`를 쓰는 Matter 애드온과 Docker에서는 UI에서 포트를 바꿀 수 있습니다.
:::

::: info UI 비밀번호는 환경변수가 아닙니다
UI 비밀번호는 `UI_PASSWORD` 같은 환경변수로 설정하지 않습니다. 직접 접속(예: Docker, Matter 애드온의 3000 포트)에서는 첫 UI 접속 시 화면에서 설정하며, `CONFIG_ROOT/ui-auth.json`에 scrypt 해시로만 저장됩니다. 이 첫 화면에서 에이전트 API 토큰과 포트·패킷 전송 허용도 함께 설정할 수 있어, AI 에이전트가 발급받은 토큰으로 초기 마법사를 곧바로 진행할 수 있습니다. Home Assistant ingress로 접속하면 Home Assistant 로그인 세션이 사용되므로 별도 비밀번호를 묻지 않고, 설정 화면의 UI 보안 섹션도 표시되지 않습니다.
:::

## 운영 튜닝 환경변수 (중요)

| 변수                          | 기본값  | 설명                                                    | 권장 사용 시점                        |
| ----------------------------- | ------- | ------------------------------------------------------- | ------------------------------------- |
| `SERIAL_PATH_WAIT_TIMEOUT_MS` | `15000` | 시리얼 장치 경로가 나타날 때까지 기다리는 최대 시간(ms) | 부팅 직후 USB 시리얼 인식이 늦는 환경 |
| `MQTT_CONNECT_TIMEOUT_MS`     | `10000` | MQTT 최초 연결 타임아웃(ms)                             | 원격 브로커/네트워크 지연이 큰 환경   |

## 빠른 예시 (Docker Compose)

```yaml
services:
  homenet2mqtt:
    image: nubiz/homenet2mqtt:latest
    environment:
      CONFIG_ROOT: /config
      MQTT_URL: mqtt://192.168.0.10:1883
      MQTT_NEED_LOGIN: 'true'
      MQTT_USER: your_user
      MQTT_PASSWD: your_password
      MQTT_TOPIC_PREFIX: homenet2mqtt
      LOG_LEVEL: info
      PORT: '3000'
      AGENT_API_ENABLED: 'false'
      TIMEZONE: Asia/Seoul
      DISCOVERY_ENABLED: 'true'
      SERIAL_PATH_WAIT_TIMEOUT_MS: '30000'
      MQTT_CONNECT_TIMEOUT_MS: '15000'
```

## 문제 상황별 권장값

- USB 시리얼이 재부팅 직후 늦게 올라오는 환경: `SERIAL_PATH_WAIT_TIMEOUT_MS=30000`
- 외부 네트워크 MQTT(지연/패킷 손실): `MQTT_CONNECT_TIMEOUT_MS=15000~30000`
- 문제 분석 시: `LOG_LEVEL=debug`

## 관련 문서

- [Docker 설치 가이드](./install-docker.md)
- [트러블슈팅](./troubleshooting.md)
