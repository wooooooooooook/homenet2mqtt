import { describe, expect, it } from 'vitest';
import { validateSerialPath } from '../../src/services/setup.service.js';

describe('validateSerialPath', () => {
  it('빈 경로를 거부한다', () => {
    expect(validateSerialPath('   ')).toEqual({ error: 'SERIAL_PATH_REQUIRED' });
  });

  it('포트 없는 IPv4 TCP 주소를 거부한다', () => {
    expect(validateSerialPath('192.168.0.83')).toEqual({ error: 'SERIAL_TCP_PORT_REQUIRED' });
  });

  it('유효하지 않은 IPv4 형식은 기존 경로처럼 통과시킨다', () => {
    expect(validateSerialPath('999.168.0.83')).toBeNull();
  });

  it('포트가 포함된 TCP 주소를 허용한다', () => {
    expect(validateSerialPath('192.168.0.83:8888')).toBeNull();
  });

  it('리눅스 시리얼 디바이스 경로를 허용한다', () => {
    expect(validateSerialPath('/dev/ttyUSB0')).toBeNull();
  });
});
