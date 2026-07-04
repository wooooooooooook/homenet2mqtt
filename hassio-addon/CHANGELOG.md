** ⚠️ 업데이트 전 백업 권장 **
- 오류가 있으면 homeasssutant [카페](https://cafe.naver.com/koreassistant), [깃헙](https://github.com/wooooooooooook/homenet2mqtt), [디스코드](https://discord.gg/kGwhUBMe5z) 등으로 알려주세요.

v2.14.1
- fix: `restore_mode`로 복원된 optimistic 엔티티의 상태가 UI 대시보드에 반영되지 않는 문제 수정
- fix: 자동화 처리로 송신된 패킷 로그가 수신 패킷 로그보다 먼저 기록되는 로깅 타이밍 문제 수정

v2.14.0
- feat: 자동화 trigger에 id를 추가하여 이를 통해 자동화내에서 분기처리가 가능하도록 했습니다. [문서보기](https://homenet2mqtt-docs.vercel.app/guide/automation.html#%E1%84%90%E1%85%B3%E1%84%85%E1%85%B5%E1%84%80%E1%85%A5-triggers)
- feat: 자동화 action - update_state의 target_id가 CEL도 받을 수 있도록 개선. [문서보기](https://homenet2mqtt-docs.vercel.app/guide/automation.html#update-state)
- fix: `restore_mode` 사용 시 복원된 상태가 MQTT 브로커로 다시 발행되지 않아 대시보드에 상태 정보가 유실되던 문제 수정
- fix: 자동화 `send_packet` 실행 시 CEL 평가 오류 등이 발생했을 때 에러로 처리되어 활동로그에 기록되도록 개선


v2.13.1
- ui: 설정, 분석화면의 네비게이션 개선
- ui: 모바일 환경에서 editor에 붙여넣기 권한이 없는 경우 우회하여 붙여넣기 가능한 모달창 제공

v2.13.0
- feat: `optimistic: true`인 엔티티에 사용할 수 있는 `restore_mode`옵션 추가 (`ALWAYS_ON`, `ALWAYS_OFF`, `RESTORE_DEFAULT_ON`, `RESTORE_DEFAULT_OFF` 지원, 기본값 `ALWAYS_OFF`)
- fix: CEL 분석기가 상세오류내용을 표시하도록 수정
- fix: 자동화의 action이 실패하더라도 활동로그에 남지 않는 문제 수정
- chore: 문서와 예제에 남아있는 offset을 index로 수정

v2.12.2
- fix: select 엔티티에서 command_select를 해석하지 않는 문제 수정.


v2.12.1
- ui: 설정화면과 분석화면을 정리했습니다.
- 로그수집을 설치시 동의후 계속 수집하는 방식에서 설정화면에서 1회성으로 버튼을 눌러 수행하는 방식으로 변경했습니다.


v2.12.0
- feat: 5분간(기본값, 설정가능) serial혹은 mqtt연결 실패시 자동으로 애드온을 재시작하는 기능 추가

v2.11.5
- fix: 엔티티 삭제시 mqtt retain message도 삭제하도록 수정


v2.11.4
- fix: mqtt 연결 끊김 후 재연결시 offline상태가 안풀리는 문제 수정


v2.11.3
- fix: 갤러리 댓글 기능이 homeassistant ingress환경에서는 작동하지 않는 문제 개선
  - ha ingress에서는 github login이 불가하여 giscus댓글작성이 안되어 우회하여 github discussion링크와 개발자계정으로 댓글 남기기 지원
- 기타 안정화 및 최적화

v2.11.2
- fix: 불필요한 셀프 mqtt 발행-구독 루프 차단
- 기타 안정화 및 최적화

v2.11.1
- fix: log level을 warning으로 설정시 crash발생 오류 수정
- fix: 설정과정에서 scripts가 중복으로 추가되는 오류 수정

v2.11.0
- beta를 종료하고 stable 버전으로 운영합니다
  - 분명 잘 안쓰이는 기능에는 버그가 많을것으로 예상되지만 1-2달간 특별한 오류 제보가 없어 stable로 전환합니다.
  - 언제든 오류 제보 환영합니다. 디스코드, 깃헙, 홈어시스턴트 카페 등 편하신곳으로 알려주세요.
- 모든 설정의 offset항목을 index로 치환하였습니다. offset으로 설정된 파일도 사용가능합니다.
  - [uartex](https://github.com/eigger/espcomponents/tree/master/components/uartex)의 스키마를 따오는 과정에서 제 지식 부족으로인해 의미상 index인것을 offset으로 사용하고있어서 이번에 바로잡았습니다.
  - 하위호환성을 챙겼으므로 기존 설정파일을 그대로 사용해도됩니다.
- 갤러리 기능 개선
  - 모호한 표현들을 정리하여 더 직관적으로 이해할 수 있도록 개선하고 조금더 이해가능한 플로우로 진행할 수 있도록 노력했습니다.
  - 혹시나 갤러리 스니펫 제작가능하신분들을 위해(계실지는 모르겠으나..) 다른 저장소의 파일도 불러올 수 있도록 했습니다. 설정에서 갤러리부분에 저장소주소를 수정할 수 있습니다.
  - **댓글기능**(giscus: github로그인 필요)을 추가하여 사용자간 정보공유가 가능합니다.
- climate의 visual 옵션들의 타입을 숫자로 정규화함
- 기타 UI 개선

... 이전 내역은 [CHANGELOG_OLD.md](https://github.com/wooooooooooook/homenet2mqtt/blob/main/hassio-addon/CHANGELOG_OLD.md)에 기록되어 있습니다.
