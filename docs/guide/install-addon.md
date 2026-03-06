# Home Assistant Add-on 설치

> 이 섹션에서 무엇을 해결하나요?
>
> - Home Assistant에서 Homenet2MQTT Add-on 설치를 완료합니다.
> - 초기 마법사로 기본 설정을 저장합니다.
> - 재시작 후 장치 자동 등록 여부를 확인합니다.

- 예상 소요 시간: **10~15분**
- 필수 준비물: Home Assistant 관리자 권한, MQTT 브로커
- 완료 기준:
  - Add-on 설치 및 실행
  - Web UI에서 설정 저장
  - Home Assistant에서 디바이스 확인

## 설치 절차

1. Home Assistant `설정 > 애드온 > 애드온 스토어`로 이동합니다.
2. 우측 상단 메뉴의 `저장소`에 아래 주소를 추가합니다.
   - `https://github.com/wooooooooooook/HAaddons`
3. `Homenet2MQTT` Add-on을 설치하고 실행합니다.
4. Add-on 상단의 `WEB UI 열기`를 눌러 초기 설정 마법사를 시작합니다.
5. 제조사를 선택하거나, 필요 시 `빈 설정파일로 시작`을 선택해 serial 값을 직접 입력합니다.
6. 저장 후 Add-on을 재시작합니다.

## 검증

- Home Assistant에서 MQTT 디바이스가 자동 등록되는지 확인합니다.
- 등록이 안 되면 [트러블슈팅](./troubleshooting.md)을 확인합니다.

---

이전: [5분 빠른 시작](./quick-start.md)
다음: [초기 연결 확인](./getting-started.md)
