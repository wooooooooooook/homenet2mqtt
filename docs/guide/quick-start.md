# 빠른 시작

> 이 섹션에서 무엇을 해결하나요?
>
> - 최소 단계로 Homenet2MQTT를 실행하고 설정하는 방법을 안내합니다.
> - 사용자의 선호에 따라 Web UI를 사용하거나 YAML 파일을 직접 편집할 수 있습니다.

- 예상 소요 시간: **5~10분**
- 필수 준비물: RS485 장치, MQTT 브로커, Homenet2MQTT 실행 환경
- 완료 기준:
  - Homenet2MQTT 환경 설치 완료
  - Web UI 또는 YAML 설정을 통한 기본 구성 완료
  - MQTT 연결 및 패킷 통신 확인

## 1) 설치 방법 선택

가장 먼저 Homenet2MQTT를 실행할 환경을 선택하고 설치합니다.

- Home Assistant 환경: [Add-on 설치 가이드](./install-addon.md)
- 일반 서버/NAS: [Docker 설치 가이드](./install-docker.md)

## 2) 연결 확인 및 문제 해결

설정을 마친 후 정상적으로 작동하는지 확인합니다.

- UI 패킷 모니터에서 RS485 수신이 보이는지 확인합니다.
- MQTT 연결 상태가 정상인지 로그를 통해 확인합니다.
- 실패 시 [트러블슈팅](./troubleshooting.md)으로 이동해 포트/권한/MQTT 인증을 먼저 확인하세요.
