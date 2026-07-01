# 최소 동작 설정

> 이 문서는 처음 실행 성공을 위한 최소 YAML 예제를 제공합니다.

## 언제 이 문서를 보나요?

- 설정 파일을 처음 만드는 경우
- 제조사 문서 전에 동작 여부를 먼저 확인하고 싶은 경우
- 직렬/MQTT 연결만 빠르게 검증하고 싶은 경우

## 최소 예제

```yaml
homenet_bridge:
  serial:
    path: /dev/ttyUSB0
    baud_rate: 9600
    data_bits: 8
    stop_bits: 1
    parity: none
    portId: main

  packet_defaults:
    rx_header: [0xAA, 0x55]
    rx_footer: [0x0D, 0x0D]
    tx_header: [0xAA, 0x55]
    tx_footer: [0x0D, 0x0D]
    rx_checksum: add_no_header
    tx_checksum: add_no_header

  switch:
    - id: livingroom_light
      name: 거실 조명
      state:
        data: [0x01, 0x00]
      state_on:
        index: 0
        data: [0x01]
      state_off:
        index: 0
        data: [0x00]
      command_on:
        data: [0x01, 0x01]
      command_off:
        data: [0x01, 0x00]
```

## 필수 확인 포인트

- `serial.path`를 실제 연결 장치에 맞게 변경하세요.
- `rx_header`, `rx_footer` (송신 시 `tx_header`, `tx_footer`)는 제조사/프로토콜에 맞게 조정해야 합니다.
- `state`, `command` 스키마는 장비의 패킷 구조에 맞게 수정하세요.

## 다음 단계

1. [공통 엔티티 옵션](./common-entity-options.md)으로 필드 확장
2. 필요한 [엔티티 타입 문서](./sensor.md) / [switch](./switch.md) 확인
3. 제조사 프로파일 반영: [제조사 허브](../manufacturers/index.md)
