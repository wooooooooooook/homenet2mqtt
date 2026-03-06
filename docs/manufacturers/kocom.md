## 빠른 요약

- 지원 기능: 조명, 스위치, 난방 등 기본 엔티티부터 순차 적용 권장
- 필수 옵션: `serial.path`, `packet_defaults`, 엔티티별 헤더/체크섬
- 자주 틀리는 설정: 헤더 오프셋, 길이 바이트, 체크섬 계산 방식
- 검증 절차: 패킷 모니터 수신 확인 → 명령 전송 → 상태 응답 검증

> 공통 점검: [트러블슈팅](../guide/troubleshooting.md)

---

## 코콤
## references
[https://deepwiki.com/zooil/kocomRS485](https://deepwiki.com/zooil/kocomRS485)
[https://deepwiki.com/lunDreame/kocom-wallpad](https://deepwiki.com/lunDreame/kocom-wallpad)

## 기본구조:

| 0 | 1 | 2 | 3 | 4 | 5 | ...| length|
|---|---|---|---|---|---|---|---|
|prefix |prefix|0x30| 명령/응답 ||  || ...|checksum|
| 0xAA|0x55 | 0x30 |0xbx: 명령</br> 0xdx: 응답 | | | | | |