[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/wooooooooooook/homenet2mqtt)

# Homenet2MQTT (RS485 HomeNet to MQTT Bridge)

RS485 기반 월패드(홈넷) 신호를 MQTT로 변환해 Home Assistant에서 제어/모니터링할 수 있도록 도와주는 브릿지입니다.

## 문서 바로가기 (권장)

상세 설치/설정/운영 가이드는 VitePress 문서에서 최신 상태로 관리합니다.

- 시작: `docs/index.md` 또는 문서 사이트 홈
- 빠른 시작: `docs/guide/quick-start.md`
- Home Assistant Add-on 설치: `docs/guide/install-addon.md`
- Docker 설치: `docs/guide/install-docker.md`
- 환경변수 레퍼런스: `docs/guide/environment-variables.md`
- 트러블슈팅: `docs/guide/troubleshooting.md`
- 설정 가이드: `docs/config/index.md`
- 제조사 허브: `docs/manufacturers/index.md`

## 빠른 요약

- 권장 설치 방법: Home Assistant Add-on
- 서버/NAS 사용자: Docker Compose
- 첫 실행 검증: Web UI 접속 → MQTT 연결 상태 → 패킷 모니터 수신

## 개발 관련

- 워크스페이스 빌드: `pnpm build`
- 린트: `pnpm lint`
- 테스트: `pnpm test`

## 지원 채널

- [GitHub Issues](https://github.com/wooooooooooook/homenet2mqtt/issues)
- [Discord](https://discord.gg/kGwhUBMe5z)

## 라이선스

MIT
