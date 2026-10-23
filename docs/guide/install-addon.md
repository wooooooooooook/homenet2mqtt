---
next:
  text: 'UI 설명'
  link: '/guide/getting-started'
---
# Home Assistant Add-on 설치

> 이 섹션에서 무엇을 해결하나요?
>
> - Home Assistant에서 Homenet Bridge (h2m) Add-on 설치를 완료합니다.
> - 초기 마법사로 기본 설정을 저장합니다.
> - 용도에 맞게 MQTT 또는 Matter 연동 방식으로 애드온을 준비합니다.

- 예상 소요 시간: **10~15분**
- 필수 준비물: EW11, USB RS485장치등의 주소(예: `192.168.0.100:8899`, `/dev/ttyUSB0`)가 필요합니다.
- 완료 기준:
  - Add-on 설치 및 실행
  - Web UI에서 설정 저장
  - Home Assistant 또는 Matter 플랫폼에서 디바이스 확인

EW11 혹은 USB RS485 장치 세팅은 완료되었다고 가정하고 시작합니다.

## 설치

1. `Home assistant`에서 `설정` - `애드온` - `우측 아래 Add-On store` - `우측 위 점3개` - `저장소` 클릭
2. 다음 주소를 추가합니다.
   `https://github.com/wooooooooooook/HAaddons`
3. 새로고침한 뒤 `Add-on store`에서 사용하려는 용도에 맞게 애드온을 검색하여 설치합니다.
   - **MQTT 연동 모드 (h2m-mqtt)**: `homenet2mqtt` 검색 후 설치
   - **Matter 연동 모드 (h2m-matter)**: `homenet2matter` 검색 후 설치
4. 설치가 완료되면 애드온을 실행하고 **웹 UI 열기**로 접속합니다.

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

## UI 인증

- 애드온의 **웹 UI 열기**는 Home Assistant ingress를 사용합니다. 이미 Home Assistant 로그인으로 인증되므로 UI 비밀번호를 묻지 않습니다. MQTT 애드온은 UI 포트 공개 옵션이 없어 ingress로만 접근하므로, 설정 화면의 **UI 보안** 섹션도 표시되지 않습니다.
- Matter 애드온처럼 호스트 포트로 직접 접속하는 경우(`http://<HA-IP>:3000`)에는 첫 접속 시 UI 비밀번호를 설정해야 합니다. 이후 접속부터는 로그인 화면이 표시됩니다.
- 비밀번호는 애드온이 사용하는 설정 디렉터리의 `ui-auth.json`에 scrypt 해시로 저장됩니다. 분실했다면 해당 파일을 삭제하고 애드온을 재시작한 뒤 첫 접속에서 다시 설정하세요.
- 애드온 구성에는 비밀번호 옵션이 없습니다. 직접 접속(비-ingress) 시에만 설정 화면의 **설정 → 애플리케이션 관리 → UI 보안**에서 비밀번호 변경과 로그아웃을 수행할 수 있습니다.

## Agent API 포트 (선택)

Agent API는 UI와 분리된 전용 포트(기본 `3001`)에서 제공되며, `agent_api_token`을 16자 이상으로 설정해야 활성화됩니다.

- **MQTT 애드온**: 애드온 구성의 **네트워크(Network)** 섹션에서 `3001/tcp`를 원하는 호스트 포트로 공개할 수 있습니다. 기본값은 비공개입니다.
- **Matter 애드온**: `host_network: true`를 사용하므로 호스트의 `3001` 포트가 그대로 열립니다. 방화벽에서 신뢰할 수 있는 대역만 허용하세요.
- ingress는 UI 포트(3000)만 프록시하므로 Agent API 접근에는 사용할 수 없습니다.

## 다음 단계

- **MQTT 연동(h2m-mqtt) 애드온**을 설치한 경우: 설정 완료 후 홈어시스턴트에서 자동으로 기기가 등록됩니다.
- **Matter 연동(h2m-matter) 애드온**을 설치한 경우: [Matter 연결 가이드](./matter-connection.md)를 확인하여 스마트홈 허브에 페어링을 완료해 주세요.

