import { HomenetBridgeConfig } from '../config/types.js';
import { MqttPublisher } from '../transports/mqtt/publisher.js';
import { MqttSubscriber } from '../transports/mqtt/subscriber.js';
import { logger } from '../utils/logger.js';

interface DiscoveryPayload {
    name: string | null;
    unique_id: string;
    state_topic: string;
    command_topic?: string;
    availability?: { topic: string }[];
    device: {
        identifiers: string[];
        name: string;
        manufacturer: string;
        model?: string;
        sw_version?: string;
    };
    device_class?: string;
    unit_of_measurement?: string;
    state_class?: string;
    icon?: string;
    value_template?: string;
    payload_on?: string;
    payload_off?: string;
    state_on?: string;
    state_off?: string;
    [key: string]: any;
}

export class DiscoveryManager {
    private config: HomenetBridgeConfig;
    private publisher: MqttPublisher;
    private subscriber: MqttSubscriber;
    private readonly discoveryPrefix = 'homeassistant';
    private readonly bridgeStatusTopic = 'homenet/bridge/status';

    constructor(
        config: HomenetBridgeConfig,
        publisher: MqttPublisher,
        subscriber: MqttSubscriber,
    ) {
        this.config = config;
        this.publisher = publisher;
        this.subscriber = subscriber;
    }

    public setup(): void {
        // Subscribe to Home Assistant status to republish discovery on restart
        this.subscriber.subscribe(`${this.discoveryPrefix}/status`, (message) => {
            const status = message.toString();
            if (status === 'online') {
                logger.info('[DiscoveryManager] Home Assistant is online, republishing discovery configs');
                this.discover();
            }
        });

        // Publish bridge online status
        this.publisher.publish(this.bridgeStatusTopic, 'online', { retain: true });
        logger.info('[DiscoveryManager] Published bridge online status');
    }

    public discover(): void {
        logger.info('[DiscoveryManager] Starting discovery process');

        const entities = [
            ...(this.config.light || []).map((e) => ({ ...e, type: 'light' })),
            ...(this.config.climate || []).map((e) => ({ ...e, type: 'climate' })),
            ...(this.config.valve || []).map((e) => ({ ...e, type: 'switch' })), // Map valve to switch for now if not supported
            ...(this.config.button || []).map((e) => ({ ...e, type: 'button' })),
            ...(this.config.sensor || []).map((e) => ({ ...e, type: 'sensor' })),
            ...(this.config.fan || []).map((e) => ({ ...e, type: 'fan' })),
            ...(this.config.switch || []).map((e) => ({ ...e, type: 'switch' })),
            ...(this.config.binary_sensor || []).map((e) => ({ ...e, type: 'binary_sensor' })),
        ];

        for (const entity of entities) {
            this.publishDiscovery(entity);
        }
    }

    private publishDiscovery(entity: any): void {
        const {
            id, name, type, device_class, unit_of_measurement, state_class, icon,
            // Filter out internal configuration objects that should not be in discovery
            state, state_on, state_off, state_speed, state_preset, state_number,
            command_on, command_off, command_speed, command_preset, command_update,
            command_mode, command_temperature, command_number,
            state_mode, state_temperature, state_current_temperature, state_action,
            ...rest
        } = entity;
        const uniqueId = `homenet_${id}`;
        const topic = `${this.discoveryPrefix}/${type}/${uniqueId}/config`;

        const payload: DiscoveryPayload = {
            name: name || null,
            unique_id: uniqueId,
            state_topic: `homenet/${id}/state`,
            availability: [{ topic: this.bridgeStatusTopic }],
            device: {
                identifiers: ['homenet_bridge_device'],
                name: 'Homenet Bridge',
                manufacturer: 'RS485 Bridge',
                model: 'Bridge',
            },
            device_class,
            unit_of_measurement,
            state_class,
            icon,
            ...rest,
        };

        if (['light', 'switch', 'fan', 'button'].includes(type)) {
            payload.command_topic = `homenet/${id}/set`;
        }

        // Entity specific configurations
        switch (type) {
            case 'switch':
            case 'light':
                // Extract state from JSON (devices publish 'state': 'ON'/'OFF')
                payload.value_template = '{{ value_json.state }}';
                // Command payloads
                payload.payload_on = 'ON';
                payload.payload_off = 'OFF';
                break;

            case 'fan':
                // Extract state from JSON
                payload.value_template = '{{ value_json.state }}';
                payload.payload_on = 'ON';
                payload.payload_off = 'OFF';

                // Preset modes support
                if (entity.preset_modes && entity.preset_modes.length > 0) {
                    payload.preset_mode_command_topic = `homenet/${id}/preset/set`;
                    payload.preset_mode_state_topic = `homenet/${id}/state`;
                    payload.preset_mode_value_template = '{{ value_json.preset_mode }}';
                }

                // Speed support
                if (entity.state_speed || entity.command_speed) {
                    payload.percentage_command_topic = `homenet/${id}/speed/set`;
                    payload.percentage_state_topic = `homenet/${id}/state`;
                    payload.percentage_value_template = '{{ value_json.speed }}';
                }
                break;
            case 'sensor':
                // Sensors are read-only, no command_topic
                // Extract value from JSON state
                if (!payload.value_template) {
                    payload.value_template = '{{ value_json.value }}';
                }
                break;
            case 'climate':
                // Climate entities use separate command topics but single state topic with templates
                payload.mode_command_topic = `homenet/${id}/mode/set`;
                payload.temperature_command_topic = `homenet/${id}/temperature/set`;

                // Use single state_topic with templates to extract values from JSON
                payload.mode_state_topic = `homenet/${id}/state`;
                payload.mode_state_template = '{{ value_json.mode }}';

                payload.temperature_state_topic = `homenet/${id}/state`;
                payload.temperature_state_template = '{{ value_json.target_temperature }}';

                payload.current_temperature_topic = `homenet/${id}/state`;
                payload.current_temperature_template = '{{ value_json.current_temperature }}';

                payload.action_topic = `homenet/${id}/state`;
                payload.action_template = '{{ value_json.action }}';

                // Default modes, should be configurable via entity config
                payload.modes = ['off', 'heat', 'cool', 'fan_only', 'dry', 'auto'];
                payload.temperature_unit = 'C';
                payload.min_temp = 15;
                payload.max_temp = 30;
                payload.temp_step = 1;
                break;
            case 'button':
                payload.payload_press = 'PRESS';
                break;
        }

        this.publisher.publish(topic, JSON.stringify(payload), { retain: true });
        logger.debug({ topic, uniqueId }, '[DiscoveryManager] Published discovery config');
    }
}
