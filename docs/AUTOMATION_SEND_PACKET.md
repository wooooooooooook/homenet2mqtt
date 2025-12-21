# `send_packet` Action

The `send_packet` action allows you to send raw packet data directly to a serial port. This is useful for controlling devices without defining a full entity or for sending custom commands dynamically.

## Configuration

```yaml
automation:
  - id: custom_command
    trigger:
      - type: state
        entity_id: sensor_button
        match: "click"
    then:
      - action: send_packet
        # Data can be an array of bytes or a CEL expression
        data: [0x01, 0x02, 0x03]
        # Optional: Add checksum automatically (default: true)
        checksum: true
        # Optional: Target port ID (defaults to automation's port or context port)
        portId: "my_port"
        # Optional: ACK configuration for retry logic
        ack:
          match:
            data: [0x01, 0x02, 0xFF]
          retry: 3
          timeout: 1000 # ms
          interval: 200 # ms
```

## Dynamic Data with CEL

You can use CEL expressions to generate packet data dynamically based on the trigger or current state.

```yaml
- action: send_packet
  # Example: Send a command with a value from the trigger state
  # Note: Use int() to ensure numbers are treated as integers if needed
  data: "[0xAA, 0x55, int(trigger.state.value)]"
```

## ACK and Retry

If the `ack` option is provided, the system will wait for a response packet matching the `match` schema. If the response is not received within `timeout` milliseconds, it will retry up to `retry` times.

```yaml
ack:
  match:
    data: [0xAA, 0x55, 0xOK]
    mask: [0xFF, 0xFF, 0x00] # Mask matching
```
