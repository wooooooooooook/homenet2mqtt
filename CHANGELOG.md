# Changelog

모든 변경 사항은 이 파일에 문서화됩니다.

이 프로젝트는 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [0.1.0] - 2025-12-15

### 프로젝트 초기화
- RS485 통신 기반의 홈네트워크 제어 시스템 모노레포(`packages/`) 구축
- **Core**: RS485-MQTT 브리지 엔진 구현
  - 제조사별 프로토콜 지원 (Commax, Kocom, Samsung SDS 등)
  - 다양한 장치 타입 지원 (Light, Climate, Fan, Lock, Valve 등)
  - YAML 기반의 유연한 설정 시스템 및 Lambda 스크립트 지원
  - MQTT Discovery 기능 탑재
- **Service**: 백엔드 API 및 웹 소켓 서버
  - 실시간 상태 모니터링 및 제어 API
  - 시스템 활동 로그(Activity Log) 수집 및 제공
- **Simulator**: 개발 및 테스트용 가상 장치 시뮬레이터
  - PTY(가상 시리얼 포트) 및 TCP 모드 지원
  - 주요 제조사 패킷 시뮬레이션 데이터 내장
- **UI**: Svelte 기반의 웹 대시보드
  - 실시간 장치 상태 확인 및 제어
  - 패킷 로그 분석 도구 및 통계 시각화
  - 반응형 디자인 및 다크 모드 지원
