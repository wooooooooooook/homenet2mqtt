# ⚠️ Deprecation Warning

**이 문서는 더 이상 유효하지 않습니다.** `!lambda` 및 `!homenet_logic` 기능은 **CEL (Common Expression Language)**로 대체되었습니다.
최신 작성법은 **[CEL 가이드](../CEL_GUIDE.md)**를 참고하세요.

---

## 마이그레이션 안내

기존의 복잡한 조건부 로직은 CEL 표현식으로 간결하게 작성할 수 있습니다.

### StateSchema와 StateNumSchema 필드

모든 `state*` 필드는 `StateSchema` 또는 `StateNumSchema` 형태입니다.
- `data`: 매칭할 바이트 배열. 패킷이 이 배열과 일치해야 상태를 인정.
- `mask`: 단일 값 또는 배열. 특정 비트만 비교할 때 사용.
- `offset`: 패킷에서 비교/추출을 시작할 인덱스.
- `inverted`: `true`면 매칭 결과를 반전해 부정 조건을 표현.

`StateNumSchema`는 추가적으로 다음 필드를 가집니다.
- `length`: 읽을 바이트 길이(기본 1).
- `precision`: 소수점 자릿수. 예: `precision: 1`이면 123 → 12.3.
- `signed`: 부호 비트 해석 여부.
- `endian`: `big` 또는 `little`.
- `decode`: `none` | `bcd` | `ascii` | `signed_byte_half_degree` | `multiply` | `add_0x80`.
- `mapping`: `{ [byte값]: 문자열 | 숫자 }` 형태의 매핑 테이블.

### CommandSchema 필드

모든 `command*` 필드는 `CommandSchema`를 사용하거나 CEL 표현식으로 대체할 수 있습니다.
- `data`: 전송할 고정 바이트 배열.
- `cmd`: 별도 명령 바이트 배열(현재 구현에선 `data` 우선 사용).
- `value_offset`: 입력값을 삽입할 오프셋.
- `value_encode`: `DecodeEncodeType` 중 하나(`none/bcd/ascii/signed_byte_half_degree/multiply/add_0x80`).
- `length`: 값이 차지하는 바이트 수.
- `signed`: 부호 처리 여부.
- `endian`: `big` 또는 `little`.
- `multiply_factor`: `value_encode: multiply`일 때 곱할 값.

### CEL 표현식으로 동적 명령 생성

다중 패킷이나 조건부 명령은 CEL 표현식으로 작성합니다:

```yaml
command_speed: >-
  x == 3 ? [[0x0b, 0x01, 0x2b, 0x02, 0x40]] :
  (x == 2 ? [[0x0b, 0x01, 0x2b, 0x02, 0x42]] :
  [[0x0b, 0x01, 0x2b, 0x02, 0x44]])
```

자세한 예시와 사용법은 [CEL 가이드](../CEL_GUIDE.md)를 참고하세요.
