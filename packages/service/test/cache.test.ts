import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PacketCache } from '../src/cache';

describe('PacketCache', () => {
    let eventBus: EventEmitter;
    let cache: PacketCache;

    beforeEach(() => {
        eventBus = new EventEmitter();
        cache = new PacketCache(eventBus);
    });

    it('should cache MQTT messages', () => {
        eventBus.emit('mqtt-message', { topic: 'test/topic', payload: 'test-payload' });

        const state = cache.getInitialState();
        expect(state.mqttState).toHaveLength(1);
        expect(state.mqttState[0]).toMatchObject({
            topic: 'test/topic',
            payload: 'test-payload',
        });
        expect(state.mqttState[0].receivedAt).toBeDefined();
    });

    it('should update existing MQTT messages', () => {
        eventBus.emit('mqtt-message', { topic: 'test/topic', payload: 'payload1' });
        eventBus.emit('mqtt-message', { topic: 'test/topic', payload: 'payload2' });

        const state = cache.getInitialState();
        expect(state.mqttState).toHaveLength(1);
        expect(state.mqttState[0].payload).toBe('payload2');
    });

    it('should cache raw packets with circular buffer', () => {
        const MAX_RAW = 1000;

        // Add MAX_RAW + 10 packets
        for (let i = 0; i < MAX_RAW + 10; i++) {
            eventBus.emit('raw-data-with-interval', { id: i, interval: i * 10 });
        }

        const state = cache.getInitialState();
        expect(state.rawPackets).toHaveLength(MAX_RAW);
        expect((state.rawPackets[0] as any).id).toBe(10); // First 10 should be dropped
        expect((state.rawPackets[MAX_RAW - 1] as any).id).toBe(MAX_RAW + 9);
        // Intervals should be preserved
        expect((state.rawPackets[0] as any).interval).toBe(100);
        expect((state.rawPackets[MAX_RAW - 1] as any).interval).toBe((MAX_RAW + 9) * 10);
    });

    it('should cache command packets with circular buffer', () => {
        const MAX_CMD = 200;

        // Add MAX_CMD + 10 packets
        for (let i = 0; i < MAX_CMD + 10; i++) {
            eventBus.emit('command-packet', { id: i });
        }

        const state = cache.getInitialState();
        expect(state.commandPackets).toHaveLength(MAX_CMD);
        expect(state.commandPackets[0].id).toBe(10);
        expect(state.commandPackets[MAX_CMD - 1].id).toBe(MAX_CMD + 9);
    });

    it('should cache packet stats', () => {
        const stats = { packetAvg: 100 };
        eventBus.emit('packet-interval-stats', stats);

        const state = cache.getInitialState();
        expect(state.packetStats).toEqual(stats);
    });
});
