# State/Command 스키마 정의

`StateSchema`, `StateNumSchema`, `CommandSchema`는 모든 엔티티와 자동화에서 공통으로 사용하는 핵심 구조입니다. 값 추출과 명령 생성의 기준이 되므로 다른 문서를 읽기 전에 이 정의를 확인하세요.

## StateSchema
| 속성 | 타입 | 설명 |
| --- | --- | --- |
| `offset` | `number` | 패킷 내 데이터 시작 오프셋(헤더 포함 여부는 설정에 따라 다름). |
| `data` | `number[]` | 패킷이 이 배열과 일치할 때만 상태를 인정합니다. |
| `mask` | `number` \| `number[]` | 비교·추출 시 `(value & mask)`를 적용합니다. 단일 값 또는 위치별 배열을 사용할 수 있습니다. |
| `inverted` | `boolean` | `true`면 매칭/추출 전에 비트를 반전(`~value`)합니다. |

## StateNumSchema
`StateSchema`를 확장하여 숫자 변환을 제공합니다.

| 속성 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `length` | `number` | `1` | 읽을 바이트 길이. |
| `endian` | `'big'` \| `'little'` | `'big'` | 다바이트일 때 바이트 순서. |
| `signed` | `boolean` | `false` | 부호 있는 정수로 해석할지 여부. |
| `precision` | `number` | `0` | 소수점 자리수. `precision: 1`이면 `123` → `12.3`. |
| `decode` | `DecodeEncodeType` | `'none'` | `bcd`, `ascii`, `signed_byte_half_degree`, `multiply`, `add_0x80` 등. |
| `mapping` | `Object` | - | `{ 원시값: 결과 }` 형태로 값을 치환합니다. |

## CommandSchema
명령 패킷 정의에 사용합니다. 단일 패킷이거나 CEL 표현식으로 다중 패킷을 반환할 수 있습니다.

| 속성 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `data` | `number[]` | - | 전송할 기본 패킷 데이터. |
| `cmd` | `number[]` | - | 보조 명령 배열(일부 구형 설정에서 사용). |
| `value_offset` | `number` | - | 입력값을 삽입할 인덱스. |
| `length` | `number` | `1` | 입력값이 차지할 바이트 길이. |
| `endian` | `'big'` \| `'little'` | `'big'` | 다바이트 값의 바이트 순서. |
| `value_encode` | `DecodeEncodeType` | `'none'` | `bcd`, `ascii`, `signed_byte_half_degree`, `multiply`, `add_0x80` 등. |
| `multiply_factor` | `number` | - | `value_encode: multiply`일 때 곱할 계수. |
| `low_priority` | `boolean` | `false` | `true`면 일반 큐가 비어 있을 때만 전송합니다. 자동화 `schedule` 트리거는 기본 `true`. |

## CEL과의 연계
- `state*`, `command*` 필드는 모두 [CEL 가이드](../CEL_GUIDE.md)의 표현식으로 대체할 수 있습니다.
- `automation` 트리거/액션에서 패킷 매칭은 `StateSchema` 규칙을, 명령 실행은 `CommandSchema` 규칙을 그대로 따릅니다. 자세한 예제는 [AUTOMATION.md](../AUTOMATION.md)를 참고하세요.
