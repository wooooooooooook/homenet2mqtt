---
layout: home

hero:
  name: h2m
  text: RS485 월패드를 MQTT또는 Matter로 연결하는 스마트 홈 브릿지
  tagline: Homenet2MQTT(h2m-mqtt) 및 Homenet2Matter(h2m-matter)를 포괄하는 한국형 홈네트워크 연동 솔루션
  actions:
    - theme: brand
      text: 빠른 시작
      link: /guide/quick-start
    - theme: alt
      text: Matter 연결 가이드
      link: /guide/matter-connection
    - theme: alt
      text: 설치 방법 보기
      link: /guide/install-addon
    - theme: alt
      text: GitHub
      link: https://github.com/wooooooooooook/homenet2mqtt

features:
  - icon: 🚀
    title: 쉬운 시작과 통합
    details: HA Add-on 또는 Docker 환경에서 Homenet2MQTT와 Homenet2Matter를 모두 간편하게 구동할 수 있습니다.
  - icon: 🔌
    title: MQTT 연동 (h2m-mqtt)
    details: RS485 패킷을 MQTT로 변환하여 Home Assistant의 MQTT Discovery 등을 통해 완벽하게 연동합니다.
  - icon: 🛡️
    title: Matter 연동 (h2m-matter)
    details: Apple Home, Samsung SmartThings, Google Home 등 다양한 스마트홈 플랫폼에 허브를 통해 직접 Matter 기기로 노출하여 제어합니다.
  - icon: 🔍
    title: 실시간 패킷 모니터링
    details: 내장된 Web UI에서 RS485 패킷 흐름을 실시간으로 확인하고 간편하게 분석 및 대응할 수 있습니다.
---

## h2m (Homenet Bridge) 이란?

**h2m**은 RS485 홈네트워크 장치와 스마트홈 플랫폼 간의 양방향 통신을 돕는 강력한 브릿지 솔루션입니다. 사용 환경과 목적에 따라 **MQTT 연동(Homenet2MQTT)**과 **Matter 연동(Homenet2Matter)** 두 가지 모드를 선택하여 사용할 수 있습니다.

| 연동 방식 | 대상 플랫폼 | 주요 특징 | 권장 사용자 |
| :--- | :--- | :--- | :--- |
| **MQTT (Homenet2MQTT)** | Home Assistant (MQTT Discovery) | 세부 설정 커스텀 및 자동화에 유용하며, 오랜 기간 검증된 유연함 제공 | 이미 구축된 MQTT 기반의 HA 설정을 사용하거나 복잡한 커스텀 규칙이 필요한 사용자 |
| **Matter (Homenet2Matter)** | Apple Home, SmartThings, Google Home, Alexa 등 | 스마트홈 표준 Matter 프로토콜을 사용해 플랫폼 허브에 직접 연동 | 복잡한 설정 없이 스마트 기기 앱에서 직접 QR 코드 스캔으로 장치를 등록하려는 사용자 |

### 주요 장점
- **자유로운 규칙 커스텀**: 다양한 아파트 월패드 환경에 맞춰 패킷 규칙을 자유롭게 커스텀할 수 있습니다.
- **다양한 활용성**: 월패드 조명, 가스, 난방, 환기팬 외에도 RS485 통신을 사용하는 시스템 에어컨 등 다양한 기기를 제어할 수 있습니다.

## 시작 전 체크리스트

- RS485 연결 장치(USB Serial 또는 EW11 등 TCP-Serial 변환기)가 준비되어 있습니다.
- 연동 방식에 따라 MQTT 브로커(MQTT 사용 시) 또는 스마트홈 플랫폼 허브(Matter 사용 시)를 준비했습니다.
- h2m을 실행할 환경(Add-on 또는 Docker)을 결정했습니다.
- 아파트 월패드 제조사(예: Bestin, Commax, Kocom, CVnet 등)를 확인했습니다.

## 바로 시작하기

- [빠른 시작 가이드](/guide/quick-start)
- [Home Assistant Add-on 설치](/guide/install-addon)
- [Docker 설치](/guide/install-docker)
- [Matter 연결 가이드](/guide/matter-connection)
- [자주 묻는 질문 & 트러블슈팅](/guide/troubleshooting)

