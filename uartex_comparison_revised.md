# `uartex` vs. homenet-bridge 기능 비교 (수정본)

이 문서는 ESPHome의 `uartex` 컴포넌트와 `homenet-bridge` 애플리케이션의 기능을 실제 코드를 기반으로 정확하게 비교하고, 구현 상태를 명확히 기술하는 것을 목표로 합니다.

## 1. 근본적인 아키텍처 차이

두 프로젝트의 가장 큰 차이점은 실행 환경과 통신 방식입니다.

- **`uartex`**: ESPHome 프레임워크 위에서 동작하며 UART 하드웨어를 직접 제어하는 컴포넌트입니다. 모든 설정은 Home Assistant와 통합된 YAML 파일을 통해 이루어집니다.
- **`homenet-bridge`**: 독립적인 Node.js 애플리케이션으로, UART 디바이스와 MQTT 브로커를 중개하는 '브릿지' 역할을 합니다. MQTT를 통해 Home Assistant 등과 연동됩니다.

## 2. 기능 구현 상태 상세 비교

### 2.1. 프로토콜 레벨 (Protocol Level)

초기 분석과 달리, `uartex`의 핵심적인 프로토콜 레벨 기능은 `homenet-bridge`에 **대부분 구현되어 있습니다.**

- **ACK/재시도 메커니즘:** **구현됨**
  - `CommandManager` (`packages/core/src/service/command.manager.ts`)가 이 로직을 담당합니다.
  - `tx_retry_cnt` (`attempts`), `tx_timeout` (`timeout`), `tx_delay` (`interval`) 설정을 모두 지원하며, 전역(`packet_defaults`) 및 개별 장치(`packet_parameters`) 설정이 가능합니다.
  - `uartex`의 명시적인 `ack` 패킷 정의 대신, `eventBus`를 통해 특정 장치의 `state:changed` 이벤트가 발생하는 것을 **암시적 ACK (Implicit ACK)** 로 간주하여 처리합니다. 이는 실제 장치의 상태 변경이 성공적으로 이루어졌음을 확인하는 더 신뢰성 있는 방식일 수 있습니다.

- **체크섬(Checksum) 알고리즘:** **부분적으로 구현됨**
  - `GenericDevice` (`packages/core/src/protocol/devices/generic.device.ts`)는 `tx_checksum` 설정을 통해 커맨드 전송 시 체크섬을 자동으로 추가하는 기능을 지원합니다.
  - `utils/checksum.ts`는 `add`, `xor`, `add_no_header` 등 `uartex`의 여러 체크섬 유형을 지원합니다.
  - `rx_checksum2`와 같은 2바이트 체크섬은 현재 지원하지 않는 것으로 보입니다.

- **GPIO 핀 제어 (`tx_ctrl_pin`):** **구현되지 않음**
  - `homenet-bridge`는 하드웨어와 분리된 소프트웨어 브릿지이므로, 이 기능은 해당되지 않습니다.

### 2.2. 장치(Entity) 기능 레벨

`homenet-bridge`는 `uartex`의 유연한 설정 방식을 대부분 지원할 수 있는 강력한 기반(`GenericDevice`)을 갖추고 있으나, 실제 개별 장치 구현체(`ClimateDevice` 등)에서는 일부 기능만 기본적으로 매핑되어 있습니다.

- **설정 처리 방식의 핵심:**
  - `GenericDevice`는 `state` 스키마(`matchState`), `state_num` 스키마(`extractValue`), 그리고 `lambda` 실행기(`LambdaExecutor`)를 통해 **`uartex`의 거의 모든 `state_*` 및 `command_*` 설정을 YAML에서 동적으로 정의하고 처리할 수 있는 능력을 갖추고 있습니다.**

- **`climate` (온도 조절 장치):** **기반은 있으나, 세부 기능 매핑 부재**
  - **구현된 기능:** `state_temperature_current`, `state_temperature_target`, `state_off`, `state_heat`, `state_cool` 등 기본적인 온도 및 모드 상태는 `ClimateDevice` 내에서 직접 파싱하여 Home Assistant 상태로 매핑합니다. `command_off`, `command_heat`, `command_temperature` 등 기본 커맨드도 지원합니다.
  - **구현되지 않은 기능 (자동 매핑 부재):**
    - `uartex.climate`가 지원하는 수많은 팬 모드(`state_fan_low`, `state_fan_medium`), 스윙 모드(`state_swing_vertical`), 프리셋(`state_preset_eco`) 등은 `ClimateDevice`의 `parseData` 메소드 내에서 Home Assistant가 이해하는 `fan_mode`, `swing_mode`, `preset_mode`로 **자동으로 변환해주는 코드가 없습니다.**
    - **해결책:** 사용자가 YAML 설정에서 `state_fan_mode`와 같은 **람다(lambda)**를 직접 정의하여, 파싱된 패킷 데이터를 기반으로 `"low"`, `"medium"`과 같은 문자열을 반환하게 하면 이 기능을 **우회적으로 구현할 수 있습니다.** 하지만 이는 `uartex`처럼 내장된 기능이 아닌 사용자 설정에 의존하는 방식입니다.
    - 예시:
      ```yaml
      climate:
        - name: 'My AC'
          # ...
          state_fan_mode:
            type: lambda
            script: !lambda |-
              if (data[10] === 0x01) return "low";
              if (data[10] === 0x02) return "medium";
              return "auto";
      ```

- **기타 장치 (`fan`, `lock` 등):** `climate`와 유사
  - `GenericDevice`를 상속받으므로, YAML 설정을 통해 `uartex`의 대부분 기능을 구현할 잠재력은 있습니다.
  - 하지만, `LockDevice`의 경우 `locking`, `unlocking`, `jammed`와 같은 세분화된 상태를 자동으로 매핑하는 코드는 구현되어 있지 않습니다. 이 역시 람다를 통해 `state_status` 같은 커스텀 상태를 만들어 처리해야 합니다.

## 3. 결론 (수정)

`homenet-bridge`는 겉보기와 달리 `uartex`의 핵심적인 저수준 프로토콜 기능(ACK/재시도 등)을 이미 충실히 구현하고 있습니다.

가장 큰 차이점은 **장치 기능의 구현 방식**에 있습니다.
- `uartex`는 각 장치(`climate`, `fan`)가 지원하는 모든 상태와 커맨드를 컴포넌트 코드 내에 **명시적으로 내장(built-in)**하고 있어 사용자가 간단한 스키마만 제공하면 됩니다.
- `homenet-bridge`는 `GenericDevice`라는 **매우 유연하고 강력한 엔진**을 제공하지만, `ClimateDevice`와 같은 구체적인 구현체에는 기본적인 기능만 포함되어 있습니다. `uartex`의 고급 기능들을 사용하기 위해서는 사용자가 **YAML에서 람다(lambda)와 `state_num` 스키마를 적극적으로 활용하여 직접 상태를 파싱하고 매핑**해야 합니다.

따라서 "기능이 없다"기보다는 **"프레임워크는 기능을 지원하지만, 개별 장치 모델에 고급 기능이 자동으로 매핑/구현되어 있지 않다"** 라고 표현하는 것이 가장 정확합니다.
