# Integration (외부 연동 설정)

HomeNet Bridge는 RS485 시리얼 통신을 통해 제어하는 홈넷 기기들을 외부 스마트홈 생태계(Home Assistant, Apple Home, Google Home 등)와 연동해 주는 브릿지 역할을 수행합니다.

`integration:` 설정을 통해 연동 프로토콜(MQTT, Matter, Log 등)을 선택하고 개별 상세 옵션을 설정할 수 있습니다.

---

## 1. MQTT 연동 설정

기존의 Home Assistant MQTT Discovery 방식을 사용하여 Home Assistant와 기기들을 연동하는 경우 설정합니다.

### 설정 예시

```yaml
integration:
  type: mqtt
  mqtt:
    url: "mqtt://localhost:1883"
    username: "user"
    password: "password"
    topic_prefix: "homenet"
    enable_discovery: true
```

### 상세 옵션 필드
| 필드명 | 타입 | 기본값 | 설명 |
| :--- | :--- | :--- | :--- |
| `url` | string | `mqtt://localhost:1883` | MQTT 브로커 연결 URL |
| `username` | string | - | MQTT 브로커 로그인 사용자 이름 (선택) |
| `password` | string | - | MQTT 브로커 로그인 비밀번호 (선택) |
| `topic_prefix` | string | `homenet` | MQTT 토픽 접두사 |
| `enable_discovery` | boolean | `true` | Home Assistant MQTT 자동 검색(Discovery) 활성화 여부 |

---

## 2. Matter 연동 설정 (향후 추가 예정 스텁)

Matter 프로토콜을 활성화하여 외부 스마트홈 컨트롤러가 직접 기기를 검색하고 제어할 수 있도록 기동하는 설정입니다. (현재는 스텁 모듈이 연결되어 로그를 출력합니다.)

### 설정 예시

```yaml
integration:
  type: matter
  matter:
    port: 5540
    passcode: 20202021
    discriminator: 3840
```

### 상세 옵션 필드
| 필드명 | 타입 | 기본값 | 설명 |
| :--- | :--- | :--- | :--- |
| `port` | number | `5540` | Matter 노드 연결 포트 |
| `passcode` | number | - | Matter 온보딩용 패스코드 (선택) |
| `discriminator` | number | - | Matter 기기 탐색용 디스크리미네이터 (선택) |

---

## 3. 로그 출력 전용 설정 (테스트용)

외부 플랫폼 연결 없이, 기기의 상태 갱신 이벤트나 수동 제어 패킷 발행 내역을 단순히 로깅하여 로컬 디버깅 및 시리얼 통신 모니터링을 하고자 할 때 사용하는 설정입니다.

### 설정 예시

```yaml
integration:
  type: log
```

---

## 하위 호환성 (Fallback)

설정 파일(`homenet_bridge.yaml`)에 `integration:` 섹션이 정의되지 않은 경우, 기존의 하위 호환 모드가 활성화되어 **CLI 옵션으로 인입된 MQTT 정보**(`--mqtt-url` 등)를 기반으로 기본 MQTT 연결을 수행하게 됩니다.
교체 가능한 유연한 다변화 연동을 적용하려면 설정 파일에 `integration:` 섹션을 새로 추가해 설정하는 것을 권장합니다.
