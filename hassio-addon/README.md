[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/wooooooooooook/RS485-HomeNet-to-MQTT-bridge)

# Homenet2MQTT - RS485 HomeNet to MQTT Bridge

> **ℹ️ 베타 버전**
> 이 프로젝트는 현재 **베타(Beta)** 단계입니다. 일부 기능에서 버그가 발생할 수 있습니다. 업데이트 시 **하위 호환성을 깨는 변경(Breaking Changes)**이 발생할 수 있으니 변경 로그를 확인해주세요.

[Config 작성법](https://github.com/wooooooooooook/RS485-HomeNet-to-MQTT-bridge/tree/main/docs/config-schema)

## 간단 사용법

1. 애드온 스토어에 저장소 추가: https://github.com/wooooooooooook/HAaddons

2. Homenet2MQTT 애드온 설치 후 실행하면 초기 설정 마법사가 표시됩니다.

3. 설정 마법사에서 월패드 종류를 선택하면 기본 설정 파일이 자동으로 생성됩니다.

4. `/homeassistant/homenet2mqtt/` 에서 생성된 설정 파일을 열어서 집에 맞게 수정하세요. 
    - 월패드 설정 파일을 ChatGPT 등에 넣고 본인 집 월패드에 등록된 디바이스들 개수를 설명해주면 AI가 작성을 도와줍니다.
    - [Config 문서](https://github.com/wooooooooooook/RS485-HomeNet-to-MQTT-bridge/tree/main/docs/config-schema)를 참고하세요.

5. (선택) 애드온 구성에서 필요시 `config_files` 배열과 `mqtt_topic_prefix`를 설정해주세요.
   - `config_files`: 설정 파일 이름을 나열합니다. 파일마다 단일 포트 구성을 담고 있으며, 항목별로 별도 브릿지가 실행됩니다. 값을 비워두면 기본값으로 `default.homenet_bridge.yaml`이 사용됩니다.
   - `mqtt_topic_prefix`: MQTT 토픽 접두사. 기본값은 `homenet2mqtt`이며 최종 토픽은 `${mqtt_topic_prefix}/{portId}/{entityId}/...` 형태로 발행됩니다.

6. 애드온을 재시작하면 설정 파일에 등록된 엔티티들이 MQTT Discovery를 통해 Home Assistant에 자동으로 등록됩니다.
    - 주의: 상태 패킷이 수신된 엔티티만 등록됩니다.

7. 애드온의 Web UI에서 다음 기능을 사용할 수 있습니다:
    - 패킷 수신 상태 확인
    - 등록된 엔티티의 상태 모니터링
    - 명령 패킷 전송
    - 패킷 간격 분석 (명령이 씹히는 경우 패킷 간격과 겹치지 않는 딜레이 설정에 활용)

## 베타 버전 현황

### ✅ 구현 완료
- Commax, Samsung SDS, Kocom 등 주요 월패드 지원
- 상태 수신 및 명령 발신
- CEL(Common Expression Language)을 통한 동적 로직 지원
- 상태 패킷 기반 엔티티 자동 등록 (MQTT Discovery)
- 초기 설정 마법사 (Web UI)
- 다국어 지원 (한국어/영어)

### 🔄 진행 중
- 추가 월패드 지원 확대
- 문서화 개선