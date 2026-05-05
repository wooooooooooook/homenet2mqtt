** ⚠️ 업데이트 전 백업 권장 **
- 오류가 있으면 homeasssutant [카페](https://cafe.naver.com/koreassistant), [깃헙](https://github.com/wooooooooooook/homenet2mqtt), [디스코드](https://discord.gg/kGwhUBMe5z) 등으로 알려주세요.

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