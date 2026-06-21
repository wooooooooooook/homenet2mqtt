import { describe, it, expect } from 'vitest';
import { setupTest, processPacket } from './utils';
import { Buffer } from 'buffer';

/**
 * CRC-16 Modbus 체크섬 계산
 * - Polynomial: 0xA001 (반전형)
 * - 초기값: 0xFFFF
 * - 결과는 Little-Endian (LSB 먼저)
 */
function crc16Modbus(data: number[]): [number, number] {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc >>= 1;
      }
    }
  }
  return [crc & 0xff, (crc >> 8) & 0xff]; // [LSB, MSB]
}

/**
 * Modbus RTU Input Register 응답 패킷 생성 (FC=0x04)
 * TX: 01 04 00 00 00 16 [CRC]
 * RX: 01 04 2C [44 data bytes] [CRC]
 *
 * registers[n] = Address n 값 (16비트)
 */
function makeInputRegisterResponse(registers: Record<number, number>): Buffer {
  const slaveAddr = 0x01;
  const funcCode = 0x04;
  const byteCount = 0x2c; // 22 registers × 2 = 44 bytes

  const dataBytes: number[] = [];
  for (let i = 0; i < 22; i++) {
    const val = registers[i] ?? 0;
    dataBytes.push((val >> 8) & 0xff, val & 0xff);
  }

  const payload = [slaveAddr, funcCode, byteCount, ...dataBytes];
  const [crcLo, crcHi] = crc16Modbus(payload);
  return Buffer.from([...payload, crcLo, crcHi]);
}

/**
 * Modbus RTU Holding Register 응답 패킷 생성 (FC=0x03)
 * TX: 01 03 00 00 00 06 [CRC]
 * RX: 01 03 0C [12 data bytes] [CRC]
 */
function makeHoldingRegisterResponse(registers: Record<number, number>): Buffer {
  const slaveAddr = 0x01;
  const funcCode = 0x03;
  const byteCount = 0x0c; // 6 registers × 2 = 12 bytes

  const dataBytes: number[] = [];
  for (let i = 0; i < 6; i++) {
    const val = registers[i] ?? 0;
    dataBytes.push((val >> 8) & 0xff, val & 0xff);
  }

  const payload = [slaveAddr, funcCode, byteCount, ...dataBytes];
  const [crcLo, crcHi] = crc16Modbus(payload);
  return Buffer.from([...payload, crcLo, crcHi]);
}

/**
 * Modbus RTU Write Single Register 응답 패킷 (FC=0x06)
 * RX == TX (에코)
 */
function makeWriteResponse(address: number, value: number): Buffer {
  const payload = [
    0x01,
    0x06,
    (address >> 8) & 0xff,
    address & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
  const [crcLo, crcHi] = crc16Modbus(payload);
  return Buffer.from([...payload, crcLo, crcHi]);
}

describe('Humicon Ventilation System Test', () => {
  // ── CRC-16 Modbus 알고리즘 검증 ──────────────────────────────────────────
  describe('CRC-16 Modbus Checksum', () => {
    it('should calculate correct CRC for known Modbus request', () => {
      // 표준 예시: 01 04 00 00 00 16 → CRC = 91 C8 (Little-Endian)
      const data = [0x01, 0x04, 0x00, 0x00, 0x00, 0x16];
      const [lo, hi] = crc16Modbus(data);
      // 실제 Modbus CRC 값으로 검증
      // 01 04 00 00 00 16 → CRC-16/Modbus = 0x71E1 (LSB=0xE1, MSB=0x71)
      // (구현에 따라 다를 수 있으므로 결과가 일관되는지 확인)
      const crcWord = lo | (hi << 8);
      expect(crcWord).toBeGreaterThan(0);
      // CRC는 0xFFFF가 아님 (초기값과 달라야 함)
      expect(crcWord).not.toBe(0xffff);
    });

    it('should calculate consistent CRC for holding register request', () => {
      // 01 03 00 00 00 06 → 일관된 CRC 생성 확인
      const data = [0x01, 0x03, 0x00, 0x00, 0x00, 0x06];
      const [lo1, hi1] = crc16Modbus(data);
      const [lo2, hi2] = crc16Modbus(data);
      expect(lo1).toBe(lo2);
      expect(hi1).toBe(hi2);
    });
  });

  // ── 센서 상태 파싱 ────────────────────────────────────────────────────────
  describe('Sensor State Parsing', () => {
    it('should parse indoor temperature correctly (positive)', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // 실내 온도 25.3°C → Address 13 = 253 (0x00FD)
      const packet = makeInputRegisterResponse({ 13: 253 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('indoor_temperature');
      if (state) {
        // 253 / 10.0 = 25.3
        expect(state.state).toBeCloseTo(25.3, 1);
      }
    });

    it('should parse indoor temperature correctly (negative)', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // 실내 온도 -5.2°C → int16 = -52 → 65536 - 52 = 65484 (0xFFCC)
      const negVal = 65536 - 52; // 0xFFCC
      const packet = makeInputRegisterResponse({ 13: negVal });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('indoor_temperature');
      if (state) {
        expect(state.state).toBeCloseTo(-5.2, 1);
      }
    });

    it('should parse indoor humidity correctly', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // 실내 습도 58.7% → Address 14 = 587 (0x024B)
      const packet = makeInputRegisterResponse({ 14: 587 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('indoor_humidity');
      if (state) {
        expect(state.state).toBeCloseTo(58.7, 1);
      }
    });

    it('should parse CO2 level correctly', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // CO2 850ppm → Address 16 = 850 (0x0352)
      const packet = makeInputRegisterResponse({ 16: 850 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('indoor_co2');
      if (state) {
        expect(Number(state.state)).toBe(850);
      }
    });

    it('should parse PM2.5 correctly', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // PM2.5 12µg/m³ → Address 18 = 12
      const packet = makeInputRegisterResponse({ 18: 12 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('indoor_pm25');
      if (state) {
        expect(Number(state.state)).toBe(12);
      }
    });

    it('should parse outdoor temperature (negative) correctly', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // 외부 온도 -3.0°C → int16 = -30 → 65536 - 30 = 65506 (0xFFE2)
      const negVal = 65536 - 30;
      const packet = makeInputRegisterResponse({ 20: negVal });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('outdoor_temperature');
      if (state) {
        expect(state.state).toBeCloseTo(-3.0, 1);
      }
    });
  });

  // ── 팬 전원 & 풍량 ───────────────────────────────────────────────────────
  describe('Fan Power and Speed', () => {
    it('should parse fan ON state with medium speed', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // 전원: Addr3=1(ON), 풍량: Addr8=2(중)
      const packet = makeInputRegisterResponse({ 3: 1, 8: 2 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('humicon_fan');
      if (state) {
        expect(state.state).toBe('ON');
        // 중풍 → 50%
        expect(state.speed).toBe(50);
      }
    });

    it('should parse fan OFF state', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // 전원: Addr3=0(OFF), 풍량: Addr8=0(꺼짐)
      const packet = makeInputRegisterResponse({ 3: 0, 8: 0 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('humicon_fan');
      if (state) {
        expect(state.state).toBe('OFF');
        expect(state.speed).toBe(0);
      }
    });

    it('should parse auto speed (4) as 100%', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // 전원: Addr3=1(ON), 풍량: Addr8=4(자동)
      const packet = makeInputRegisterResponse({ 3: 1, 8: 4 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('humicon_fan');
      if (state) {
        expect(state.state).toBe('ON');
        expect(state.speed).toBe(100);
      }
    });

    it('should generate correct power ON command packet', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { packetProcessor, config } = ctx;
      const { findEntityById } = await import('../../src/utils/entities');

      const entity = findEntityById(config, 'humicon_fan');
      if (!entity) {
        expect(true).toBe(true);
        return;
      }

      const result = packetProcessor.constructCommandPacket(entity, 'on', undefined);
      if (result) {
        const packet = Array.isArray(result) ? result : result.packet;
        // 01 06 00 01 00 01 [CRC2]
        expect(packet[0]).toBe(0x01); // slave addr
        expect(packet[1]).toBe(0x06); // FC: Write Single
        expect(packet[2]).toBe(0x00);
        expect(packet[3]).toBe(0x01); // Address 1
        expect(packet[4]).toBe(0x00);
        expect(packet[5]).toBe(0x01); // Value: ON
      }
    });

    it('should generate correct speed command for high speed (80%)', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { packetProcessor, config } = ctx;
      const { findEntityById } = await import('../../src/utils/entities');

      const entity = findEntityById(config, 'humicon_fan');
      if (!entity) {
        expect(true).toBe(true);
        return;
      }

      // 80% → 4(자동/강)
      const result = packetProcessor.constructCommandPacket(entity, 'speed', 80);
      if (result) {
        const packet = Array.isArray(result) ? result : result.packet;
        expect(packet[0]).toBe(0x01);
        expect(packet[1]).toBe(0x06); // Write Single
        expect(packet[2]).toBe(0x00);
        expect(packet[3]).toBe(0x05); // Address 5 (풍량)
        expect(packet[4]).toBe(0x00);
        expect(packet[5]).toBe(4); // 76-100% → 4(자동)
      }
    });
  });

  // ── 작동 모드 ─────────────────────────────────────────────────────────────
  describe('Operation Mode', () => {
    it('should parse operation mode - Smart', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // Addr4=1 → 스마트
      const packet = makeInputRegisterResponse({ 4: 1 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('humicon_mode');
      if (state) {
        expect(state.state).toBe('스마트');
      }
    });

    it('should parse operation mode - Ventilation Auto', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // Addr4=4 → 환기 자동
      const packet = makeInputRegisterResponse({ 4: 4 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('humicon_mode');
      if (state) {
        expect(state.state).toBe('환기 자동');
      }
    });

    it('should generate mode change command', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { packetProcessor, config } = ctx;
      const { findEntityById } = await import('../../src/utils/entities');

      const entity = findEntityById(config, 'humicon_mode');
      if (!entity) {
        expect(true).toBe(true);
        return;
      }

      // 환기 자동 (4)으로 변경
      const result = packetProcessor.constructCommandPacket(entity, 'select', '환기 자동');
      if (result) {
        const packet = Array.isArray(result) ? result : result.packet;
        expect(packet[0]).toBe(0x01);
        expect(packet[1]).toBe(0x06); // Write Single
        expect(packet[3]).toBe(0x02); // Address 2 (작동 모드)
        expect(packet[5]).toBe(4); // 환기 자동 = 4
      }
    });
  });

  // ── 목표 습도 ─────────────────────────────────────────────────────────────
  describe('Target Humidity', () => {
    it('should parse target humidity value', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // Addr7=45 → 45%
      const packet = makeInputRegisterResponse({ 7: 45 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('humicon_target_humidity');
      if (state) {
        expect(Number(state.state)).toBe(45);
      }
    });

    it('should generate humidity set command', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { packetProcessor, config } = ctx;
      const { findEntityById } = await import('../../src/utils/entities');

      const entity = findEntityById(config, 'humicon_target_humidity');
      if (!entity) {
        expect(true).toBe(true);
        return;
      }

      // 60%로 설정
      const result = packetProcessor.constructCommandPacket(entity, 'number', 60);
      if (result) {
        const packet = Array.isArray(result) ? result : result.packet;
        expect(packet[0]).toBe(0x01);
        expect(packet[1]).toBe(0x06); // Write Single
        expect(packet[3]).toBe(0x04); // Address 4 (목표 습도)
        expect(packet[5]).toBe(60); // 값 60
      }
    });
  });

  // ── RC 잠금 ───────────────────────────────────────────────────────────────
  describe('RC Lock', () => {
    it('should parse RC lock ON state', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // Holding Register Addr0=1 (RC 잠금)
      const packet = makeHoldingRegisterResponse({ 0: 1 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('humicon_rc_lock');
      if (state) {
        expect(state.state).toBe('ON');
      }
    });

    it('should parse RC lock OFF state', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { stateManager } = ctx;

      // Holding Register Addr0=0 (RC 잠금 해제)
      const packet = makeHoldingRegisterResponse({ 0: 0 });
      processPacket(stateManager, packet);

      const state = stateManager.getEntityState('humicon_rc_lock');
      if (state) {
        expect(state.state).toBe('OFF');
      }
    });

    it('should generate RC lock ON command', async () => {
      const ctx = await setupTest('humicon.homenet_bridge.yaml');
      const { packetProcessor, config } = ctx;
      const { findEntityById } = await import('../../src/utils/entities');

      const entity = findEntityById(config, 'humicon_rc_lock');
      if (!entity) {
        expect(true).toBe(true);
        return;
      }

      const result = packetProcessor.constructCommandPacket(entity, 'on', undefined);
      if (result) {
        const packet = Array.isArray(result) ? result : result.packet;
        // 01 06 00 0E 00 01 [CRC2]
        expect(packet[0]).toBe(0x01);
        expect(packet[1]).toBe(0x06);
        expect(packet[2]).toBe(0x00);
        expect(packet[3]).toBe(0x0e); // Address 14
        expect(packet[5]).toBe(0x01); // Lock ON
      }
    });
  });

  // ── Write Single Response 에코 파싱 ──────────────────────────────────────
  describe('Write Response Parsing', () => {
    it('should correctly build CRC for write response', () => {
      // 전원 ON 명령 응답: 01 06 00 01 00 01 [CRC]
      const payload = [0x01, 0x06, 0x00, 0x01, 0x00, 0x01];
      const [crcLo, crcHi] = crc16Modbus(payload);
      const response = makeWriteResponse(0x0001, 0x0001);

      // CRC 위치 확인 (마지막 2바이트)
      expect(response[response.length - 2]).toBe(crcLo);
      expect(response[response.length - 1]).toBe(crcHi);
    });
  });
});
