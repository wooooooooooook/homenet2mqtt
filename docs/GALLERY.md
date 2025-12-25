# 스니펫 갤러리 가이드

스니펫 갤러리는 커뮤니티에서 공유한 설정을 웹 UI에서 확인하고 적용할 수 있는 기능입니다. 각 스니펫은 YAML 형식으로 제공되며 아래 항목을 포함할 수 있습니다.

## 갤러리 데이터 제공 경로

- 갤러리 목록: `/api/gallery/list`
- 스니펫 파일: `/api/gallery/file?path=<vendor/file.yaml>`

서비스는 GitHub 저장소(`https://raw.githubusercontent.com/wooooooooooook/RS485-HomeNet-to-MQTT-bridge/main/gallery/`)에서 파일을 가져와 위 API로 프록시합니다. 이를 통해 갤러리 업데이트가 GitHub에 push되면 자동으로 반영됩니다.

## 스니펫 구성

- `entities`: 엔티티 설정 모음 (`light`, `sensor` 등 엔티티 타입별 배열)
- `automation`: 자동화 규칙 배열
- `scripts`: 스크립트 정의 배열

`scripts` 항목은 자동화 액션에서 재사용할 수 있는 스크립트 정의를 담습니다. 갤러리에서 스니펫을 적용하면 `scripts` 항목도 함께 구성 파일에 병합됩니다.

## 적용 시 동작

1. 기존 설정과 ID 충돌 여부를 확인합니다.
2. 충돌 항목은 덮어쓰기/건너뛰기/새 ID로 추가 중 하나를 선택할 수 있습니다.
3. 스니펫 적용 시 설정 파일이 백업됩니다.
