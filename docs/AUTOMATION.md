# Automation Guide

HomenetBridge allows you to create automations that trigger actions based on state changes, received packets, schedules, or startup events.

## Triggers

### State Trigger
Triggers when an entity's state changes and matches a condition.
```yaml
trigger:
  - type: state
    entity_id: light_1
    property: state_on  # optional, if omitted checks the entire state object
    match: true         # value or object { gt: 10, lt: 20 }
    debounce_ms: 100    # optional, prevents rapid firing
```

### Packet Trigger
Triggers when a raw packet matching a schema is received.
```yaml
trigger:
  - type: packet
    match:
      data: [0xAA, 0x55]
      offset: 0
```

### Schedule Trigger
Triggers periodically or based on a cron expression.
```yaml
trigger:
  - type: schedule
    every: 5m      # run every 5 minutes
    # or
    cron: '0 0 * * *' # run at midnight every day
```

### Startup Trigger
Triggers when the automation manager starts (application boot).
```yaml
trigger:
  - type: startup
```

## Actions

### Command
Sends a command to an entity.
```yaml
action: command
target: id(light_1).command_on()
# or
target: id(climate_1).command_target_temp(24)
```

### Publish (MQTT)
Publishes a message to an MQTT topic.
```yaml
action: publish
topic: homenet/event
payload: "something happened"
retain: true # optional
```

### Send Packet (Raw)
Sends a raw packet to the device.
```yaml
action: send_packet
data: [0x02, 0x01, 0xFF]
# or use CEL
data: "[0x02, x, 0xFF]" # x is available in context if applicable
ack: [0x06] # Optional: Wait for specific ACK packet (array or CEL)
# ack: "data[0] == 0x06"
```

### Delay
Pauses execution for a set duration.
```yaml
action: delay
milliseconds: 1000 # or '1s'
```

### Log
Logs a message to the console/system log.
```yaml
action: log
level: info # trace, debug, info, warn, error
message: "Automation executed"
```

## Guards

You can add a `guard` (condition) to any trigger or the automation itself. Guards use CEL expressions.

```yaml
automation:
  - id: auto_light
    trigger:
      - type: state
        entity_id: sensor_lux
    guard: "states['sensor_lux']['illuminance'] < 100"
    then:
      - action: command
        target: id(light_1).command_on()
```
