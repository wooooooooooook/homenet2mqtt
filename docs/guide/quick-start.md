# 5분 빠른 시작

> 이 섹션에서 무엇을 해결하나요?
>
> - 최소 단계로 Homenet2MQTT를 실행하고 UI 접속까지 확인합니다.
> - 제조사 설정을 빠르게 선택합니다.
> - 첫 MQTT 송수신이 되는지 확인합니다.

- 예상 소요 시간: **5~10분**
- 필수 준비물: RS485 장치, MQTT 브로커, Homenet2MQTT 실행 환경
- 완료 기준:
  - Web UI 접속 성공
  - 제조사 설정 선택 또는 빈 설정 파일 생성
  - MQTT 연결 상태 확인

## 1) 설치 방법 선택

- Home Assistant 환경: [Add-on 설치 가이드](./install-addon.md)
- 일반 서버/NAS: [Docker 설치 가이드](./install-docker.md)

## 2) Web UI 접속

- 브라우저에서 `http://<서버IP>:3000` 또는 Add-on의 `WEB UI 열기`로 접속합니다.

## 3) 제조사 선택

- 마법사에서 제조사를 선택합니다.
- 제조사가 헷갈리면 [제조사 허브](../manufacturers/index.md)에서 먼저 확인합니다.
- 직접 구성하려면 **빈 설정 파일로 시작**을 선택합니다.

## 4) 연결 확인

- UI에서 MQTT 연결 상태가 정상인지 확인합니다.
- 패킷 모니터에서 RS485 수신이 보이는지 확인합니다.

## 5) 실패 시 즉시 점검

- [트러블슈팅](./troubleshooting.md)으로 이동해 포트/권한/MQTT 인증을 먼저 확인하세요.

---

이전: [소개](./introduction.md)
다음: [초기 연결 확인](./getting-started.md)
