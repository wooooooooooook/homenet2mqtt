# 제조사 허브

국내 주요 홈네트워크 제조사 및 HVAC 시스템의 RS485 통신 프로토콜 특징, 패킷 구조, 갤러리 프리셋 활용법을 정리한 문서 허브입니다.

---

## 📊 제조사별 프로토콜 특징 비교

| 제조사 | 기본 Baud / Parity | 헤더 (Prefix) | 길이 특성 | 체크섬 알고리즘 | 주요 프로토콜 특징 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **[Bestin (베스틴)](./bestin.md)** | 9600 / NONE | `0x02` | 혼합 (10B 고정 / 가변) | Sum & 0xFF | **시퀀스 번호(0~255) 트래킹 필수**, Gen1/Gen2/AIO/2.0 디밍 조명 지원 |
| **[Commax (코맥스)](./commax.md)** | 9600 / NONE | 가변 (`0x30`, `0x04`, `0xB0` 등) | **8B 고정** | Sum & 0xFF | **온도/층수/전력량 BCD 인코딩**, 단순하고 일관된 8바이트 프레임 |
| **[CVnet (씨브이넷)](./cvnet.md)** | 9600 / NONE | 상태: `0x20 0x01` | 가변 | Sum / XOR | 연속 방 데이터 패킷(`0x4A`/`0x4B`), 제어 후 ACK 이중 전송 구조 |
| **[Ezville (이지빌/자이)](./ezville.md)** | 9600 / NONE | `0xF7` (일반) | 기기별 가변 | Sum / XOR | `0x36 0x1F 0x81` 전체 상태 브로드캐스트, **0.5°C 단위(MSB 플래그)** 및 외출 모드 |
| **[Hyundai (현대통신 이마주)](./hyundai.md)** | 9600 / NONE | `0xF7` ... `0xEE` | 고정 프레임 (`0x0B`/`0x0D`) | XOR / Sum | 상위 니블 방 번호 / 하위 니블 기기 번호, **상태 프록시(State Proxy)** 활용 |
| **[Kocom (코콤)](./kocom.md)** | 9600 / NONE | `AA 55` | 16~18B 고정 | 2B Checksum | Theart(상태 유지형 제어), Thinks(나비엔 환기), 도어벨(`0x70 0x90`) 특수 프레임 |
| **[LGAP (LG 시스템에어컨)](./lgap.md)** | 4800 / NONE | TX: `0x80`, RX: `0x10` | 8B(TX) / 16B(RX) | `add_final_xor(0x55)` | ODU/IDU 직접 통신, **정기 폴링(5s) 필수**, zone별 IDU 상태 조회 |
| **[Samsung SDS (삼성 SDS)](./samsung_sds.md)** | 9600 / **EVEN** | `0xB0`, `0xAC`, `0xAE` 등 | 가변 | `samsung_xor` | **반드시 EVEN Parity**, 현관스위치(AD/CC) 탈거 후 월패드 응답 자동화 |

---

## 제조사별 상세 문서 바로가기

- [Bestin (현대산업개발 아이파크 베스틴)](./bestin.md)
- [Commax (코맥스)](./commax.md)
- [CVnet (씨브이넷 / 대림 e편한세상)](./cvnet.md)
- [Ezville (이지빌 / 자이)](./ezville.md)
- [Hyundai (현대통신 이마주 / 힐스테이트)](./hyundai.md)
- [Kocom (코콤 / 디아트 / 씽크스)](./kocom.md)
- [LGAP (LG 시스템에어컨 RS485)](./lgap.md)
- [Samsung SDS (삼성 SDS / 래미안 / EZON / HVAC)](./samsung_sds.md)

---

## 공통 문제 해결

- 포트 연결/권한 문제: [트러블슈팅](../guide/troubleshooting.md)
- 시리얼 Parity 및 패킷 defaults 설정: [Packet Defaults](../config/packet-defaults.md)
- 유효 패킷 검증 및 헤더 필터링: [유효 패킷 탐지 전략](../config/packet-validation-strategies.md)
- 엔티티 타입 선택 문제: [설정 가이드](../config/index.md)
