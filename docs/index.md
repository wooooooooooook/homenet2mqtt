---
layout: home

hero:
  name: Homenet2MQTT
  text: RS485 월패드를 MQTT로 연결하는 가장 빠른 방법
  tagline: Home Assistant와 연동 가능한 한국형 Wallpad 브릿지
  actions:
    - theme: brand
      text: 빠른 시작
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

## Homenet2MQTT 란?

Homenet2MQTT는 RS485 장치에서 수신된 패킷을 정해진 규칙에 따라 해석하여 MQTT로 발행하고, MQTT를 통해 다시 정해진 규칙을 따라 명령을 RS485 장치로 전송하는 강력한 브릿지입니다.

- **자유로운 규칙 커스텀**: 다양한 환경에 맞게 패킷 규칙을 자유롭게 커스텀할 수 있는 것이 이 앱의 가장 큰 강점입니다. 최대한 GUI를 통해 클릭으로 설정이 가능하도록 구성했지만, 본질적으로는 YAML 편집이 필요한 ESPHome과 유사한 성격을 가집니다. (초기 설정 마법사와 UI 상의 갤러리는 일종의 예제라고 볼 수 있습니다.)
- **다양한 활용성**: 월패드뿐만 아니라 RS485 통신을 사용하는 시스템 에어컨 등 다양한 기기에도 활용할 수 있습니다.

### 이 앱이 필요한 사람
- 기존에 만들어진 애드온이 없고 **직접 패킷을 분석할 예정인 사람**
- 제공되는 기능 외에 **더 세밀한 커스텀이 필요한 사람**

> **참고**: 기존에 만들어진 월패드별 애드온이나 통합구성요소가 있고 잘 작동하는 경우 이 앱을 굳이 사용할 필요는 없습니다.

## 나는 어떤 사용자?

### 1) Home Assistant Add-on 사용자
- Home Assistant OS/Supervised 환경을 쓰고 있고 가장 간단한 설치를 원한다면 Add-on이 가장 좋습니다.
- 바로 시작: [Add-on 설치 가이드](/guide/install-addon)

### 2) Docker 사용자
- 별도 서버나 NAS에서 운용하거나, compose로 배포/백업을 관리하고 싶다면 Docker를 권장합니다.
- 바로 시작: [Docker 설치 가이드](/guide/install-docker)


## 시작 전 체크리스트

- RS485 연결 장치(USB Serial 또는 TCP-Serial)가 준비되어 있습니다.
- MQTT 브로커 접속 정보(host/port/계정)를 확인했습니다.
- Homenet2MQTT를 실행할 환경(Add-on 또는 Docker)을 결정했습니다.
- 제조사(예: Bestin, Commax, Kocom)를 확인했습니다.

## 막히면 바로 여기로

- [트러블슈팅 바로가기](/guide/troubleshooting)
