import { defineConfig } from "vitepress"

export default defineConfig({
  title: "Homenet2MQTT",
  description: "RS485 HomeNet to MQTT Bridge Documentation",
  lastUpdated: true,

  themeConfig: {
    lastUpdated: {
      text: '마지막 업데이트',
      formatOptions: {
        dateStyle: 'full',
        timeStyle: 'short'
      }
    },
    editLink: {
      pattern: 'https://github.com/wooooooooooook/homenet2mqtt/edit/main/docs/:path',
      text: '이 페이지 수정하기'
    },
    nav: [
      { text: "홈", link: "/" },
      { text: "시작하기", link: "/guide/quick-start" },
      { text: "설치", link: "/guide/install-addon" },
      { text: "설정", link: "/config/" },
      { text: "제조사", link: "/manufacturers/index" },
      { text: "운영/문제해결", link: "/guide/troubleshooting" },
      { text: "참고", link: "/guide/introduction" },
      { text: "☕ 후원", link: "/sponsor" }
    ],

    sidebar: {
      "/guide/": [
        {
          text: "시작하기",
          items: [
            { text: "5분 빠른 시작", link: "/guide/quick-start" },
            { text: "사전 준비", link: "/guide/introduction" }
          ]
        },
        {
          text: "설치 방법",
          items: [
            { text: "Home Assistant Add-on 설치", link: "/guide/install-addon" },
            { text: "Docker 설치", link: "/guide/install-docker" }
          ]
        },
        {
          text: "운영 가이드",
          items: [
            { text: "초기 연결 확인", link: "/guide/getting-started" },
            { text: "환경변수 레퍼런스", link: "/guide/environment-variables" },
            { text: "고급 설정", link: "/guide/advanced-setup" },
            { text: "자동화", link: "/guide/automation" },
            { text: "엔티티 예제", link: "/guide/entity-examples" },
            { text: "CEL 가이드", link: "/guide/cel-guide" },
            { text: "스크립트", link: "/guide/scripts" },
            { text: "갤러리", link: "/guide/gallery" },
            { text: "성능 최적화", link: "/guide/optimization" },
            { text: "트러블슈팅", link: "/guide/troubleshooting" }
          ]
        }
      ],
      "/config/": [
        {
          text: "처음 설정하기",
          items: [
            { text: "설정 개요", link: "/config/" },
            { text: "최소 동작 설정", link: "/config/minimal-config" }
          ]
        },
        {
          text: "핵심 개념",
          items: [
            { text: "Serial 옵션", link: "/config/serial" },
            { text: "Packet Defaults", link: "/config/packet-defaults" },
            { text: "유효 패킷 탐지 전략", link: "/config/packet-validation-strategies" },
            { text: "State/Command 스키마", link: "/config/schemas" },
            { text: "공통 엔티티 옵션", link: "/config/common-entity-options" }
          ]
        },
        {
          text: "엔티티 타입 레퍼런스",
          items: [
            { text: "Binary Sensor", link: "/config/binary-sensor" },
            { text: "Button", link: "/config/button" },
            { text: "Climate", link: "/config/climate" },
            { text: "Fan", link: "/config/fan" },
            { text: "Light", link: "/config/light" },
            { text: "Lock", link: "/config/lock" },
            { text: "Number", link: "/config/number" },
            { text: "Select", link: "/config/select" },
            { text: "Sensor", link: "/config/sensor" },
            { text: "Switch", link: "/config/switch" },
            { text: "Text", link: "/config/text" },
            { text: "Text Sensor", link: "/config/text-sensor" },
            { text: "Valve", link: "/config/valve" }
          ]
        }
      ],
      "/manufacturers/": [
        {
          text: "제조사 선택 가이드",
          items: [
            { text: "제조사 허브", link: "/manufacturers/index" },
            { text: "Bestin", link: "/manufacturers/bestin" },
            { text: "Commax", link: "/manufacturers/commax" },
            { text: "CVnet", link: "/manufacturers/cvnet" },
            { text: "Ezville", link: "/manufacturers/ezville" },
            { text: "Hyundai", link: "/manufacturers/hyundai" },
            { text: "Kocom", link: "/manufacturers/kocom" },
            { text: "Samsung SDS", link: "/manufacturers/samsung_sds" }
          ]
        }
      ],
      "/sponsor": [
        {
          text: "후원 안내",
          items: [
            { text: "☕ 후원하기", link: "/sponsor" }
          ]
        }
      ],

    },

    socialLinks: [
      { icon: "github", link: "https://github.com/wooooooooooook/homenet2mqtt" }
    ],

    search: {
      provider: 'local'
    }
  }
})
