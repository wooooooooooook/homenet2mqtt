# 유효 패킷 탐지 전략

`homenet_bridge.packet_defaults`의 `rx_*` 설정 조합에 따라, 파서는 수신 버퍼에서 유효 패킷을 찾는 방식을 다르게 선택합니다.

이 문서는 **어떤 조건에서 어떤 전략이 동작하는지**, 그리고 **헤더/푸터 또는 길이 기반 설정을 어떻게 선택할지**를 빠르게 판단할 수 있도록 정리한 레퍼런스입니다.

## 전략 선택 우선순위

동일한 설정에 여러 조건이 동시에 존재하면 아래 우선순위로 적용됩니다.

1. 고정 길이 (`rx_length`)
2. 푸터 구분 (`rx_footer`)
3. 체크섬 스윕 (`rx_checksum`/`rx_checksum2`, 필요 시 `rx_length_expr` 보조)

> [!NOTE]
> `rx_length`와 `rx_length_expr`를 동시에 지정하면 `rx_length`가 우선하고, `rx_length_expr`는 무시됩니다.

## 전략 A: 헤더 + 고정 길이 (`rx_header` + `rx_length`)

가장 단순하고 빠른 방식입니다.

- **적합한 경우**
  - 제조사 프로토콜에서 패킷 길이가 항상 고정일 때
  - 패킷 끝 구분자(푸터)가 없거나 신뢰하기 어려울 때
- **핵심 설정**
  - `rx_header`
  - `rx_length`
  - (선택) `rx_checksum` 또는 `rx_checksum2`
- **동작 개요**
  - 헤더 정렬 후 `rx_length`만큼 버퍼를 잘라 후보 패킷을 만듭니다.
  - 체크섬이 정의되어 있으면 검증 후 통과한 경우만 유효 패킷으로 채택합니다.

```yaml
homenet_bridge:
  packet_defaults:
    rx_header: [0xAA, 0x55]
    rx_length: 21
    rx_checksum: add_no_header
```

## 전략 B: 헤더 + 푸터 (`rx_header` + `rx_footer`)

가변 길이 패킷에서 가장 흔히 쓰는 방식입니다.

- **적합한 경우**
  - 패킷 끝을 명확히 나타내는 푸터가 존재할 때
  - 길이 바이트가 없거나 모델별로 의미가 다를 때
- **핵심 설정**
  - `rx_header`
  - `rx_footer`
  - (선택) `rx_checksum` 또는 `rx_checksum2`
- **동작 개요**
  - 헤더 이후 푸터를 탐색해 패킷 경계를 확정합니다.
  - 후보가 여러 개일 수 있으므로 체크섬 검증으로 최종 유효 패킷을 결정합니다.

```yaml
homenet_bridge:
  packet_defaults:
    rx_header: [0xF7]
    rx_footer: [0xAA]
    rx_checksum: add_no_header
```

## 전략 C: 헤더 + 길이 표현식 (`rx_header` + `rx_length_expr`)

패킷 내부 길이 바이트를 CEL로 계산하는 최적화 방식입니다.

- **적합한 경우**
  - 길이 정보가 패킷 안에 있지만, 모든 패킷 타입에 일관되게 적용되지는 않을 때
  - 푸터 없이 가변 길이 패킷을 다뤄야 할 때
- **핵심 설정**
  - `rx_header`
  - `rx_length_expr`
  - `rx_checksum` 또는 `rx_checksum2` (권장)
- **동작 개요**
  - `rx_length_expr` 결과가 `> 0`이면 해당 길이로 바로 후보 패킷을 검증합니다.
  - 결과가 `0`/음수이거나 데이터가 부족하면 체크섬 스윕으로 자동 폴백합니다.

```yaml
homenet_bridge:
  packet_defaults:
    rx_header: [0x02]
    rx_checksum: bestin_sum
    rx_length_expr: "data[1] == 0x28 || data[1] == 0x2E ? data[2] : 0"
```

## 전략 D: 헤더 + 체크섬 스윕 (`rx_header` + checksum)

길이도 푸터도 확실하지 않을 때 쓰는 범용 방식입니다.

- **적합한 경우**
  - 프로토콜 문서가 불완전해 길이/푸터 규칙을 확정하기 어려울 때
  - 디바이스별로 프레임 형식이 섞여 있어 단일 규칙 적용이 어려울 때
- **핵심 설정**
  - `rx_header`
  - `rx_checksum` 또는 `rx_checksum2`
  - (선택) `rx_min_length`, `rx_max_length`, `rx_valid_headers`
- **동작 개요**
  - 최소/최대 길이 범위 내에서 가능한 후보 길이를 순회하며 체크섬을 검증합니다.
  - 우연한 체크섬 일치(false positive)를 줄이기 위해 `rx_valid_headers`를 함께 설정하는 것을 권장합니다.

```yaml
homenet_bridge:
  packet_defaults:
    rx_checksum: samsung_xor
    rx_valid_headers: [0xB0, 0xAD, 0xCC, 0xA4]
    rx_min_length: 6
    rx_max_length: 32
```

## 어떤 전략을 고를까?

1. **길이가 고정**이면 `rx_length`를 먼저 사용합니다.
2. 길이가 가변이면 **푸터 유무**를 확인하고, 있으면 `rx_footer`를 사용합니다.
3. 푸터가 없고 길이 바이트가 신뢰 가능하면 `rx_length_expr`를 사용합니다.
4. 위 정보가 불명확하면 체크섬 스윕으로 시작하고, 캡처가 쌓이면 더 구체적인 전략으로 좁혀갑니다.

## 안정성 체크리스트

- `rx_header`는 실제 캡처 기준으로 작성했는가?
- 체크섬 계산 범위(헤더 포함/제외)가 실제 프로토콜과 일치하는가?
- 스윕 전략 사용 시 `rx_min_length`/`rx_max_length`를 좁혀 탐색 범위를 제한했는가?
- 체크섬 충돌이 의심되면 `rx_valid_headers`를 추가했는가?

## 관련 문서

- [Packet Defaults](./packet-defaults.md)
- [CEL 가이드 - 동적 패킷 길이](./cel-guide.md#7-동적-패킷-길이-rx_length_expr)
- [트러블슈팅](../guide/troubleshooting.md)
