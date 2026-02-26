import { defineConfig } from "vitepress"

export default defineConfig({
  title: "Homenet2MQTT",
  description: "RS485 HomeNet to MQTT Bridge Documentation",

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Guide", link: "/guide/introduction" },
      { text: "Configuration", link: "/config/" },
      { text: "Manufacturers", link: "/manufacturers/bestin" }
    ],

    sidebar: {
      "/config/": [
        {
          text: "Configuration",
          items: [
            { text: "Overview", link: "/config/" },
            { text: "Schemas", link: "/config/schemas" },
            { text: "Packet Defaults", link: "/config/packet-defaults" },
            { text: "Common Options", link: "/config/common-entity-options" },
            { text: "Serial Options", link: "/config/serial" }
          ]
        },
        {
          text: "Entity Types",
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
          text: "Manufacturer Guides",
          items: [
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
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Introduction", link: "/guide/introduction" },
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Troubleshooting", link: "/guide/troubleshooting" }
          ]
        },
        {
          text: "Advanced",
          items: [
            { text: "Automation", link: "/guide/automation" },
            { text: "CEL Guide", link: "/guide/cel-guide" },
            { text: "Scripts", link: "/guide/scripts" },
            { text: "Entity Examples", link: "/guide/entity-examples" },
            { text: "Gallery", link: "/guide/gallery" },
            { text: "Optimization", link: "/guide/optimization" },
            { text: "Breaking Changes", link: "/guide/breaking-changes" }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/wooooooooooook/homenet2mqtt" }
    ]
  }
})
