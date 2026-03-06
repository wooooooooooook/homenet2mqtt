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
    baudrate: 9600
    dataBits: 8
    stopBits: 1
    parity: none
    portId: main

  packet_defaults:
    header: 'AA55'
    footer: '0D0D'

  entities:
    - type: switch
      id: livingroom_light
      name: 거실 조명
      state:
        topic: homenet2mqtt/state/livingroom/light
      command:
        topic: homenet2mqtt/command/livingroom/light
```

## 필수 확인 포인트

- `serial.path`를 실제 연결 장치에 맞게 변경하세요.
- `header`, `footer`는 제조사/프로토콜에 맞게 조정해야 합니다.
- `state.topic`, `command.topic`은 운영 토픽 규칙과 맞추세요.

## 다음 단계

1. [공통 엔티티 옵션](./common-entity-options.md)으로 필드 확장
2. 필요한 [엔티티 타입 문서](./sensor.md) / [switch](./switch.md) 확인
3. 제조사 프로파일 반영: [제조사 허브](../manufacturers/index.md)
