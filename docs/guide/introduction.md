# 소개

> 이 섹션에서 무엇을 해결하나요?
>
> - Homenet2MQTT가 어떤 문제를 해결하는지 이해합니다.
> - 설치 전에 알아야 할 하드웨어/네트워크 전제를 정리합니다.
> - 권장 문서 읽기 순서를 확인합니다.

## 권장 읽기 순서

1. [5분 빠른 시작](./quick-start.md)
2. [Home Assistant Add-on 설치](./install-addon.md) 또는 [Docker 설치](./install-docker.md)
3. [초기 연결 확인](./getting-started.md)
4. [환경변수 레퍼런스](./environment-variables.md)
5. [트러블슈팅](./troubleshooting.md)

## Homenet2MQTT란?

Homenet2MQTT는 RS485 기반 월패드(홈넷) 신호를 MQTT 메시지로 변환해 Home Assistant에서 제어/모니터링할 수 있게 해주는 브릿지입니다.

## 준비물

- RS485 USB Serial 장치 또는 TCP-Serial 변환 장치(EW11 등)
- MQTT 브로커(권장: Home Assistant Mosquitto add-on)
- Homenet2MQTT 실행 환경(Add-on 또는 Docker)

## 다음 단계

- 빠르게 성공 사례부터 만들고 싶다면 [5분 빠른 시작](./quick-start.md)으로 이동하세요.
