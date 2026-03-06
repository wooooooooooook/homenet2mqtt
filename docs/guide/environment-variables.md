# 환경변수 레퍼런스

> 이 문서는 Homenet2MQTT 운영 시 사용하는 주요 환경변수를 한 곳에서 정리합니다.

## 공통 환경변수

| 변수 | 기본값 | 설명 | 사용처 |
|---|---|---|---|
| `CONFIG_FILES` | `default.homenet_bridge.yaml,` | 로드할 설정 파일 목록(쉼표 구분) | Add-on, Docker |
| `CONFIG_ROOT` | `/config` (Docker) / `packages/core/config` (로컬) | 설정 파일 루트 경로 | Add-on, Docker, 로컬 |
| `MQTT_URL` | `mqtt://localhost:1883` | MQTT 브로커 주소 | Add-on, Docker, 로컬 |
| `MQTT_NEED_LOGIN` | `false` | MQTT 인증 사용 여부 | Docker |
| `MQTT_USER` | `''` | MQTT 사용자명 | Docker |
| `MQTT_PASSWD` | `''` | MQTT 비밀번호 | Docker |
| `MQTT_TOPIC_PREFIX` | `homenet2mqtt` | MQTT 토픽 접두사 | Add-on, Docker, 로컬 |
| `PORT` | `3000` | Web UI 포트 | Add-on, Docker, 로컬 |
| `LOG_LEVEL` | `info` | 로그 레벨 (`trace`, `debug`, `info`, `warn`, `error`) | Add-on, Docker, 로컬 |
| `TIMEZONE` | 시스템 기본값 | 런타임 타임존 | Add-on, Docker, 로컬 |
| `DISCOVERY_ENABLED` | `false` | Home Assistant Discovery 활성화 여부 | Docker |

## 운영 튜닝 환경변수 (중요)

| 변수 | 기본값 | 설명 | 권장 사용 시점 |
|---|---|---|---|
| `SERIAL_PATH_WAIT_TIMEOUT_MS` | `15000` | 시리얼 장치 경로가 나타날 때까지 기다리는 최대 시간(ms) | 부팅 직후 USB 시리얼 인식이 늦는 환경 |
| `MQTT_CONNECT_TIMEOUT_MS` | `10000` | MQTT 최초 연결 타임아웃(ms) | 원격 브로커/네트워크 지연이 큰 환경 |

## 빠른 예시 (Docker Compose)

```yaml
services:
  homenet2mqtt:
    image: nubiz/homenet2mqtt:latest
    environment:
      CONFIG_FILES: default.homenet_bridge.yaml,
      CONFIG_ROOT: /config
      MQTT_URL: mqtt://192.168.0.10:1883
      MQTT_NEED_LOGIN: 'true'
      MQTT_USER: your_user
      MQTT_PASSWD: your_password
      MQTT_TOPIC_PREFIX: homenet2mqtt
      LOG_LEVEL: info
      PORT: '3000'
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
