---
layout: home

hero:
  name: Homenet2MQTT
  text: RS485 월패드를 MQTT로 연결하는 가장 빠른 방법
  tagline: Home Assistant와 연동 가능한 한국형 Wallpad 브릿지
  actions:
    - theme: brand
      text: 5분 빠른 시작
      link: /guide/quick-start
    - theme: alt
      text: 설치 방법 보기
      link: /guide/install-addon
    - theme: alt
      text: GitHub
      link: https://github.com/wooooooooooook/homenet2mqtt

features:
  - icon: 🚀
    title: 빠른 설치
    details: Add-on 또는 Docker 중 환경에 맞는 방법으로 바로 시작할 수 있습니다.
  - icon: 🏠
    title: Home Assistant 자동 발견
    details: 설정 완료 후 디바이스가 Home Assistant에 자동 등록됩니다.
  - icon: 🔍
    title: 실시간 모니터링
    details: Web UI에서 RS485 패킷 흐름을 확인하고 문제를 빠르게 진단할 수 있습니다.
---

## 나는 어떤 사용자?

### 1) Home Assistant Add-on 사용자
- Home Assistant OS/Supervised 환경을 쓰고 있고 가장 간단한 설치를 원한다면 Add-on이 가장 좋습니다.
- 바로 시작: [Add-on 설치 가이드](/guide/install-addon)

### 2) Docker 사용자
- 별도 서버나 NAS에서 운용하거나, compose로 배포/백업을 관리하고 싶다면 Docker를 권장합니다.
- 바로 시작: [Docker 설치 가이드](/guide/install-docker)

### 3) 기존 설정 마이그레이션 사용자
- 기존 YAML 설정을 유지하면서 구조만 개선하고 싶다면 최소 설정과 고급 설정 문서부터 확인하세요.
- 바로 시작: [최소 동작 설정](/config/minimal-config), [고급 설정](/guide/advanced-setup)

## 시작 전 체크리스트

- RS485 연결 장치(USB Serial 또는 TCP-Serial)가 준비되어 있습니다.
- MQTT 브로커 접속 정보(host/port/계정)를 확인했습니다.
- Homenet2MQTT를 실행할 환경(Add-on 또는 Docker)을 결정했습니다.
- 제조사(예: Bestin, Commax, Kocom)를 확인했습니다.

➡ 제조사 확인이 필요하다면: [제조사 허브](/manufacturers/index)

## 막히면 바로 여기로

- [트러블슈팅 바로가기](/guide/troubleshooting)
