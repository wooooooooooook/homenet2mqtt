# Uartex 기능 완성 TODO

> 이 문서는 uartex의 TypeScript/MQTT 포팅 완성을 위한 작업 목록입니다.

## Phase 1: 핵심 엔티티 구현

### Lock Entity
- [x] `lock.entity.ts` 인터페이스 정의
- [x] `lock.device.ts` Device 클래스 구현
- [x] PacketProcessor에 lock 타입 등록
- [x] MQTT Discovery에 lock 지원 추가
- [x] 테스트 케이스 작성

### Number Entity
- [x] `number.entity.ts` 인터페이스 정의
- [x] `number.device.ts` Device 클래스 구현
- [x] PacketProcessor에 number 타입 등록
- [x] MQTT Discovery에 number 지원 추가
- [x] 테스트 케이스 작성

### Select Entity
- [x] `select.entity.ts` 인터페이스 정의
- [x] `select.device.ts` Device 클래스 구현
- [x] PacketProcessor에 select 타입 등록
- [x] MQTT Discovery에 select 지원 추가
- [x] 테스트 케이스 작성

### Climate Entity 확장
- [x] `climate.entity.ts` 습도 관련 속성 추가
- [x] `climate.entity.ts` 추가 모드 (fan_only, dry, auto) 추가
- [x] `climate.entity.ts` 스윙 모드 추가
- [x] `climate.entity.ts` 팬 모드 추가
- [x] `climate.entity.ts` 프리셋 모드 추가
- [x] `climate.entity.ts` 커스텀 모드 추가
- [ ] `climate.device.ts` 새로운 속성 처리 구현
- [ ] MQTT Discovery에 확장 기능 지원
- [ ] 테스트 업데이트

## Phase 2: MQTT Discovery 및 테스트

### MQTT Discovery
- [ ] Lock Discovery 페이로드 생성
- [ ] Number Discovery 페이로드 생성
- [ ] Select Discovery 페이로드 생성
- [ ] Climate 확장 기능 Discovery 업데이트

### 테스트
- [ ] `lock.device.test.ts` 작성
- [ ] `number.device.test.ts` 작성
- [ ] `select.device.test.ts` 작성
- [ ] `climate.device.test.ts` 확장 기능 테스트 추가

### 예제 설정 파일
- [ ] `example_lock.homenet_bridge.yaml` 작성
- [ ] `example_number.homenet_bridge.yaml` 작성
- [ ] `example_select.homenet_bridge.yaml` 작성

## Phase 3: 나머지 엔티티 및 기능 확장

### Text Sensor Entity
- [x] `text-sensor.entity.ts` 인터페이스 정의
- [x] `text-sensor.device.ts` Device 클래스 구현
- [x] PacketProcessor에 text_sensor 타입 등록
- [x] MQTT Discovery에 text_sensor 지원 추가
- [x] 테스트 케이스 작성 (3개 테스트 통과)

### Text Entity
- [x] `text.entity.ts` 인터페이스 정의
- [x] `text.device.ts` Device 클래스 구현
- [x] PacketProcessor에 text 타입 등록
- [x] MQTT Discovery에 text 지원 추가
- [x] 테스트 케이스 작성 (4개 테스트 통과)

### Light Entity 확장
- [x] `light.entity.ts` brightness, color, effects 속성 추가
- [x] `light.device.ts` 확장 기능 처리 구현 (brightness, RGB, color_temp, white)
- [x] MQTT Discovery 업데이트 (brightness, RGB, color_temp, effects)
- [ ] 테스트 업데이트

### Fan Entity 확장
- [x] `fan.entity.ts` preset, oscillation, direction 속성 추가
- [x] `fan.device.ts` 확장 기능 처리 구현 (presets, oscillation, direction, percentage)
- [x] MQTT Discovery 업데이트 (percentage, presets, oscillation, direction)
- [ ] 테스트 업데이트

### Valve Entity 확장
- [x] `valve.entity.ts` position, stop, opening/closing 상태 추가
- [x] `valve.device.ts` 확장 기능 처리 구현 (position, opening/closing, stop)
- [x] MQTT Discovery 업데이트 (position, stop)
- [ ] 테스트 업데이트

## Phase 4: 문서화

### README 업데이트
- [x] Lock 엔티티 사용 예제 추가
- [x] Number 엔티티 사용 예제 추가
- [x] Select 엔티티 사용 예제 추가
- [x] Text Sensor 엔티티 사용 예제 추가
- [x] Text 엔티티 사용 예제 추가
- [x] Climate 확장 기능 문서화
- [x] Light 밝기/색상 기능 문서화
- [x] Fan 프리셋 기능 문서화
- [x] Valve 위치/정지 기능 문서화
- [x] 제외된 기능 명시 (GPIO, on_read/write, custom checksum, media_player)

### 예제 문서
- [x] `docs/ENTITY_EXAMPLES.md` 생성
  - 모든 엔티티 타입 상세 예제
  - 기본 및 고급 설정 예제
  - Lambda, Precision, Endianness 설명
  - 900+ 라인의 포괄적인 가이드

---

## 제외된 기능 (uartex에는 있으나 구현 안함)

- ~~GPIO 제어 (`tx_ctrl_pin`)~~ - UART 관련 기능 별도 구현
- ~~이벤트 핸들러 (`on_read`, `on_write`)~~ - TypeScript 환경에서 불필요
- ~~Custom Lambda Checksum~~ - 기본 체크섬으로 충분
- ~~Media Player Entity~~ - 사용 빈도 낮음
