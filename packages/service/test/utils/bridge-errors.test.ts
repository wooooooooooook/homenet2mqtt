import { describe, it, expect } from 'vitest';
import {
  createBridgeErrorPayload,
  formatBridgeErrorMessage,
  mapSerialError,
  mapConfigLoadError,
  mapMqttError,
  mapMqttDisconnect,
  mapBridgeStartError,
} from '../../src/utils/bridge-errors';

describe('bridge-errors utils', () => {
  describe('createBridgeErrorPayload', () => {
    it('should create a payload with correct defaults', () => {
      const payload = createBridgeErrorPayload({
        code: 'TEST_CODE',
        source: 'core',
      });

      expect(payload.code).toBe('TEST_CODE');
      expect(payload.source).toBe('core');
      expect(payload.severity).toBe('error');
      expect(payload.retryable).toBe(true);
      expect(typeof payload.timestamp).toBe('string');
    });

    it('should override defaults', () => {
      const payload = createBridgeErrorPayload({
        code: 'TEST_CODE',
        message: 'Test Message',
        detail: 'Test Detail',
        source: 'mqtt',
        portId: 'COM1',
        severity: 'warning',
        retryable: false,
      });

      expect(payload.code).toBe('TEST_CODE');
      expect(payload.message).toBe('Test Message');
      expect(payload.detail).toBe('Test Detail');
      expect(payload.source).toBe('mqtt');
      expect(payload.portId).toBe('COM1');
      expect(payload.severity).toBe('warning');
      expect(payload.retryable).toBe(false);
      expect(typeof payload.timestamp).toBe('string');
    });
  });

  describe('formatBridgeErrorMessage', () => {
    it('should return empty string for falsy input', () => {
      expect(formatBridgeErrorMessage(undefined)).toBe('');
      expect(formatBridgeErrorMessage(null)).toBe('');
      expect(formatBridgeErrorMessage('')).toBe('');
    });

    it('should return the string itself if input is a string', () => {
      expect(formatBridgeErrorMessage('Simple error')).toBe('Simple error');
    });

    it('should return message if available in payload', () => {
      const payload = createBridgeErrorPayload({
        code: 'CODE',
        message: 'Message',
        detail: 'Detail',
        source: 'core',
      });
      expect(formatBridgeErrorMessage(payload)).toBe('Message');
    });

    it('should return detail if message is missing', () => {
      const payload = createBridgeErrorPayload({
        code: 'CODE',
        detail: 'Detail',
        source: 'core',
      });
      expect(formatBridgeErrorMessage(payload)).toBe('Detail');
    });

    it('should return code if message and detail are missing', () => {
      const payload = createBridgeErrorPayload({
        code: 'CODE',
        source: 'core',
      });
      expect(formatBridgeErrorMessage(payload)).toBe('CODE');
    });
  });

  describe('mapSerialError', () => {
    it('should map various serial errors', () => {
      expect(mapSerialError({ code: 'ENOENT', message: 'no such file' }, 'port1').code).toBe('SERIAL_PATH_NOT_FOUND');
      expect(mapSerialError({ code: 'EACCES', message: 'permission denied' }).code).toBe('SERIAL_PERMISSION_DENIED');
      expect(mapSerialError({ code: 'EBUSY', message: 'busy' }).code).toBe('SERIAL_PORT_BUSY');
      expect(mapSerialError({ code: 'ENOTFOUND', message: 'not found' }).code).toBe('SERIAL_HOST_NOT_FOUND');
      expect(mapSerialError({ code: 'ECONNREFUSED', message: 'refused' }).code).toBe('SERIAL_CONNECTION_REFUSED');
      expect(mapSerialError({ code: 'ETIMEDOUT', message: 'timeout' }).code).toBe('SERIAL_CONNECTION_TIMEOUT');
      expect(mapSerialError('유효한 path가 필요합니다').code).toBe('SERIAL_PATH_MISSING');
      expect(mapSerialError(new Error('Unknown error')).code).toBe('SERIAL_CONNECT_FAILED');
    });
  });

  describe('mapConfigLoadError', () => {
    it('should map config load error', () => {
      const payload = mapConfigLoadError(new Error('Config error'));
      expect(payload.code).toBe('CORE_CONFIG_LOAD_FAILED');
      expect(payload.message).toBe('Config error');
      expect(payload.retryable).toBe(false);
    });
  });

  describe('mapMqttError', () => {
    it('should map various MQTT errors', () => {
      expect(mapMqttError(new Error('Not authorized')).code).toBe('MQTT_AUTH_FAILED');
      expect(mapMqttError({ code: 'ECONNREFUSED' }).code).toBe('MQTT_CONNECT_FAILED');
      expect(mapMqttError('Unknown MQTT error').code).toBe('MQTT_CONNECT_FAILED');
    });
  });

  describe('mapMqttDisconnect', () => {
    it('should create a disconnect payload', () => {
      const payload = mapMqttDisconnect('port1');
      expect(payload.code).toBe('MQTT_DISCONNECTED');
      expect(payload.severity).toBe('warning');
      expect(payload.portId).toBe('port1');
    });
  });

  describe('mapBridgeStartError', () => {
    it('should detect serial errors in start error', () => {
      expect(mapBridgeStartError(new Error('serial(COM1) failed')).source).toBe('serial');
      expect(mapBridgeStartError(new Error('시리얼 포트 오류')).source).toBe('serial');
      expect(mapBridgeStartError({ code: 'ENOENT' }).source).toBe('serial');
    });

    it('should detect MQTT errors in start error', () => {
      const payload = mapBridgeStartError(new Error('MQTT connection error'));
      expect(payload.source).toBe('mqtt');
    });

    it('should return default core error for unknown start error', () => {
      const payload = mapBridgeStartError(new Error('Something else'));
      expect(payload.code).toBe('CORE_START_FAILED');
      expect(payload.source).toBe('core');
    });
  });
});
