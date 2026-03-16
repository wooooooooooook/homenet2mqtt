---
next:
  text: 'UI 설명'
  link: '/guide/getting-started'
---
# Home Assistant Add-on 설치

> 이 섹션에서 무엇을 해결하나요?
>
> - Home Assistant에서 Homenet2MQTT Add-on 설치를 완료합니다.
> - 초기 마법사로 기본 설정을 저장합니다.
> - 재시작 후 장치 자동 등록 여부를 확인합니다.

- 예상 소요 시간: **10~15분**
- 필수 준비물: EW11, USB RS485장치등의 주소(예: `192.168.0.100:8899`, `/dev/ttyUSB0`)가 필요합니다.
- 완료 기준:
  - Add-on 설치 및 실행
  - Web UI에서 설정 저장
  - Home Assistant에서 디바이스 확인

EW11 혹은 USB RS485 장치 세팅은 완료되었다고 가정하고 시작합니다.

## 설치

1. `Home assistant`에서 `설정` - `애드온` - `우측 아래 Add-On store` - `우측 위 점3개` - `저장소` 클릭
2. 다음 주소를 추가합니다.
   `https://github.com/wooooooooooook/HAaddons`
3. 새로고침한 뒤 `Add-on store`에서 `homenet2mqtt`를 검색하여 설치하고 웹UI로 접속합니다.

## 초기 설정

<img width="320" alt="image" src="https://github.com/user-attachments/assets/e7584a2b-1ef7-42b6-ac6f-f65b91f3329a" />

1. `예제 설정 선택`에서 알맞은 제조사를 선택
2. `시리얼 포트 경로`에 준비해둔 EW11의 ip주소 혹은 USB RS485장치의 주소를 입력합니다.
3. 다음버튼을 누르면 시리얼경로 테스트가 진행됩니다. 다음으로 넘어가지면 성공입니다.

   > <img width="320" alt="image" src="https://github.com/user-attachments/assets/dfb363d6-483a-4faf-a7b6-958f097acc71" />

4. 2단계는 수정할 필요없습니다. 다음으로 넘어갑니다.

<img width="320" alt="image" src="https://github.com/user-attachments/assets/773df165-2f6e-47a5-a267-c36a890acc77" />

5. 추가할 엔티티를 선택합니다. 나중에 추가/제거할 수 있으므로 대충 넘어갑니다.

<img width="320" alt="image" src="https://github.com/user-attachments/assets/f1abea4b-b6a2-4f3a-8c29-6a2e01c9519b" />

6. 로그 공유 동의 화면을 넘어가면 끝입니다. 재시작을 눌러 초기 설정을 마무리합니다.
