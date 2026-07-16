# 외부 연동 및 Matter 설정

HomeNet Bridge는 외부 스마트홈 생태계(Home Assistant, Apple Home, Google Home 등)와 연동해 주는 브릿지 역할을 수행합니다.
기기 연동 방식(MQTT, Matter, Log)의 결정은 **환경변수**를 통해 지정하며, Matter 연동의 세부 설정(포트, 패스코드 등)은 **설정 파일(YAML)**의 `matter:` 섹션을 통해 구성합니다.

---

## 1. 연동 방식 선택

HomeNet Bridge는 Home Assistant 애드온 및 독립형 Docker 환경 등 사용자의 가동 환경에 따라 연동 방식을 선택하여 기동합니다. (설정 파일 내 `integration` 키는 더 이상 지원하지 않습니다.)

### Home Assistant 애드온 환경 (권장 및 일반적인 사용 방식)
애드온 실행 환경에서는 환경변수를 별도로 설정할 필요가 없습니다. 애드온 저장소(Repository)에 용도별로 독립적으로 배포되는 전용 애드온 중 연동 목적에 맞춰 하나를 선택하여 설치하고 기동하시면 자동으로 해당 모드가 기본 가동됩니다.
* **Homenet2MQTT 애드온**: 기존의 Home Assistant MQTT Discovery 방식을 사용한 HA 기기 연동.
* **Homenet2Matter 애드온**: Matter 프로토콜을 활성화하여 기기를 Matter 장치로 직접 노출.

---

### Docker 컨테이너 환경 (독립 빌드 및 수동 구축 방식)
독립형 Docker 또는 Docker Compose를 활용하여 별도 구축한 서버 환경에서는 컨테이너 기동 시 환경변수 **`INTEGRATION_TYPE`**을 사용하여 연동 모드를 결정합니다.

* **`INTEGRATION_TYPE=mqtt`** (기본값): MQTT 연동 모드로 기동.
* **`INTEGRATION_TYPE=matter`**: Matter 연동 모드로 기동.
* **`INTEGRATION_TYPE=log`**: 외부 플랫폼 연결 없이 상태 갱신 로깅만 출력하는 디버그 모드로 기동.

#### Docker CLI 실행 예시 (Matter 모드)
```bash
docker run -d \
  --name homenet2mqtt \
  --privileged \
  --net=host \
  -v /dev:/dev \
  -v /data/homenet:/config \
  -e INTEGRATION_TYPE=matter \
  nubiz/homenet2mqtt:latest
```

#### Docker Compose 구성 예시 (Matter 모드)
```yaml
version: "3"
services:
  homenet:
    image: nubiz/homenet2mqtt:latest
    container_name: homenet2mqtt
    privileged: true
    network_mode: host            # Matter mDNS 기기 검색을 위해 필수적입니다.
    environment:
      - INTEGRATION_TYPE=matter
    volumes:
      - /dev:/dev
      - ./config:/config
    restart: unless-stopped
```

> [!WARNING]
> **Docker 네트워크 모드 설정 (mDNS):**
> Matter 프로토콜은 플랫폼과의 연결 및 연동을 위해 mDNS (UDP 5353) 멀티캐스트 패킷을 사용합니다. 일반적인 포트 포워딩(`ports:` 매핑)을 사용할 경우 Docker 브릿지 방화벽 장벽에 멀티캐스트가 유실되어 외부 연동 허브가 장치를 절대 찾을 수 없습니다. 따라서 Matter 기동 시에는 반드시 **`network_mode: host` (`--net=host`)** 모드로 기동해야 합니다.

---

## 2. Matter 상세 설정 (YAML)

Matter 연동 방식을 사용하는 경우, 각 설정 파일(`homenet_bridge.yaml`)에 `matter:` 섹션을 추가하여 상세 옵션을 개별 지정할 수 있습니다.

### 설정 예시

```yaml
# homenet_bridge.yaml
serial:
  portId: "ttyUSB0"
  path: "/dev/ttyUSB0"
  baud_rate: 9600
  data_bits: 8
  parity: "none"
  stop_bits: 1

matter:
  port: 5540                     # 기본값: 5540 + bridgeIndex
  product_name: "거실 월패드 브릿지" # 기본값: H2M {portId} (예: H2M ttyUSB0)
  passcode: 10203040             # 기본값: matter.js에 의해 8자리 난수 자동 생성
  discriminator: 1234            # 기본값: matter.js에 의해 12비트 난수 자동 생성
  storage_path: "/data/matter"   # 기본값: ./.matter-storage
```

### 상세 옵션 필드 및 검증 범위

| 필드명 | 타입 | 허용 범위 / 기본값 | 설명 |
| :--- | :--- | :--- | :--- |
| `port` | number | `1` ~ `65535` / `5540 + index` | Matter 노드가 바인딩할 네트워크 포트. 지정된 포트가 이미 점유 중인 경우 자동으로 다음 빈 포트를 찾아 할당합니다. |
| `passcode` | number | `1` ~ `99999998` / **자동 난수 생성** | 온보딩을 위한 8자리 패스코드. 설정하지 않을 시 안전한 난수로 자동 생성되며 생성된 코드는 Web UI의 시스템 토폴로지 화면에서 확인할 수 있습니다. (동일 번호의 연속이나 연속 정수 등 취약한 값은 검증에서 제외됩니다.) |
| `discriminator` | number | `0` ~ `4095` / **자동 난수 생성** | Matter 장치 식별을 위한 12비트 디스크리미네이터. 설정하지 않을 시 난수로 자동 생성됩니다. |
| `product_name` | string | 문자열 / `H2M {portId}` | 스마트홈 제어 플랫폼에 노출되는 브릿지 기기 이름. 생략 시 포트 정보를 활용한 고유 이름이 배정됩니다. |
| `storage_path` | string | 경로 문자열 / `.matter-storage` | Matter 장치 인증/스토리지 데이터가 저장될 로컬 경로. |

> [!NOTE]
> 벤더 ID(`vendor_id`)는 **`65521`**, 제품 ID(`product_id`)는 **`32768`**로 소스 내에서 상수로 고정되어 있으며, 설정 파일(`matter.*`)을 통한 임의 할당이 불가능합니다.


