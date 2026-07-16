# 소개

> 이 섹션에서 무엇을 해결하나요?
>
> - Homenet Bridge (h2m) 가 어떤 문제를 해결하는지 이해합니다.
> - 설치 전에 알아야 할 하드웨어/네트워크 전제를 정리합니다.
> - 권장 문서 읽기 순서를 확인합니다.

## 권장 읽기 순서

1. [Home Assistant Add-on 설치](./install-addon.md) 또는 [Docker 설치](./install-docker.md)
2. [UI설명](./getting-started.md)
3. 연동 방식에 따라 연결 완료하기:
   - **MQTT 연동 시**: Home Assistant 연동 상태 확인
   - **Matter 연동 시**: [Matter 연결 가이드](./matter-connection.md) 참고하여 기기 추가

## h2m (Homenet Bridge) 이란?

RS485 기반 월패드(홈넷) 신호를 변환하여 스마트홈 플랫폼과 연동하는 통합 브릿지 솔루션입니다. 목적에 따라 두 가지 모드를 제공합니다.

*   **MQTT 연동 (Homenet2MQTT / h2m-mqtt)**: 기기 패킷을 MQTT로 변환해 Home Assistant의 MQTT Discovery 등을 통해 통합 제어합니다.
*   **Matter 연동 (Homenet2Matter / h2m-matter)**: 기기를 Matter 표준 장치로 직접 노출하여 Apple Home, SmartThings, Google Home 등 다양한 스마트홈 플랫폼에 직접 등록 및 제어합니다.

## 준비물

- RS485 USB Serial 장치 또는 TCP-Serial 변환 장치(EW11 등)
- MQTT 브로커 (MQTT 연동 모드 사용 시: Home Assistant Mosquitto add-on 등)
- 스마트홈 연동 컨트롤러 / 허브 (Matter 연동 모드 사용 시: SmartThings Hub, Apple HomePod, Google Nest Hub 등)
- 실행 환경 (HA Add-on 또는 Docker)


