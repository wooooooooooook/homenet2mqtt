import { describe, it, expect } from 'vitest';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import {
  buildApplyConfig,
  buildDraftAnalysisConfig,
  computeDraftHash,
  validateDraft,
  type AgentDraftInput,
} from '../../src/agent/services/draft.service.js';
import { ConfigItemsError } from '../../src/services/config-items.service.js';

const makeConfig = (): HomenetBridgeConfig =>
  ({
    serial: {
      portId: 'default',
      path: '/dev/ttyUSB0',
      baud_rate: 9600,
      data_bits: 8,
      parity: 'none',
      stop_bits: 1,
    },
    sensor: [
      {
        id: 'existing',
        name: 'Existing Sensor',
        state: { index: 0, length: 1, type: 'byte' },
      },
    ],
  }) as unknown as HomenetBridgeConfig;

const makeDraft = (sensorId = 'new_sensor'): AgentDraftInput => ({
  entities: {
    sensor: [
      {
        id: sensorId,
        name: 'New Sensor',
        state: { index: 1, length: 1, type: 'byte' },
      },
    ],
  },
});

const fileContent = 'homenet_bridge:\n  serial:\n    portId: default\n';

describe('agent draft service', () => {
  it('validates a draft without mutating the active config', () => {
    const active = makeConfig();
    const before = JSON.stringify(active);

    const result = validateDraft(active, makeDraft(), { fileContent });

    expect(result.valid).toBe(true);
    expect(result.applicable).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.normalized.entities.sensor).toHaveLength(1);
    expect((result.normalized.entities.sensor[0] as any).id).toBe('new_sensor');
    expect(result.draftHash.startsWith('sha256:')).toBe(true);
    expect(JSON.stringify(active)).toBe(before);
  });

  it('rejects draft ids that are not MQTT-safe', () => {
    const result = validateDraft(
      makeConfig(),
      {
        entities: {
          sensor: [{ id: 'bad id!', name: 'Bad', state: { index: 0, length: 1 } }],
        },
      },
      { fileContent },
    );

    expect(result.valid).toBe(false);
    expect(result.applicable).toBe(false);
    expect(result.errors.some((error) => error.message.includes('letters, numbers'))).toBe(true);
  });

  it('detects exact id conflicts and blocks applicability', () => {
    const result = validateDraft(makeConfig(), makeDraft('existing'), { fileContent });

    expect(result.valid).toBe(true);
    expect(result.applicable).toBe(false);
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ draftId: 'existing', kind: 'id', existingId: 'existing' }),
      ]),
    );
  });

  it('reports signature similarity as a warning, not a blocker', () => {
    const active = makeConfig();
    (active.sensor as any[])[0].state = { index: 1, length: 1, type: 'byte' };

    const result = validateDraft(active, makeDraft(), { fileContent });

    expect(result.valid).toBe(true);
    expect(result.applicable).toBe(true);
    expect(result.conflicts.some((conflict) => conflict.kind === 'signature')).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('produces a stable draft hash', () => {
    const first = validateDraft(makeConfig(), makeDraft(), { fileContent });
    const second = validateDraft(makeConfig(), makeDraft(), { fileContent });
    const otherFile = validateDraft(makeConfig(), makeDraft(), { fileContent: 'other' });

    expect(first.draftHash).toBe(second.draftHash);
    expect(first.draftHash).not.toBe(otherFile.draftHash);
    expect(computeDraftHash(fileContent, first.normalized)).toBe(first.draftHash);
  });

  it('merges a draft into an analysis config', () => {
    const { config, issues } = buildDraftAnalysisConfig(makeConfig(), makeDraft());

    expect(issues).toEqual([]);
    expect((config.sensor as any[]).map((sensor) => sensor.id)).toEqual(['existing', 'new_sensor']);
  });

  it('overwrites an existing entity when resolved', () => {
    const result = buildApplyConfig(
      makeConfig(),
      {
        entities: {
          sensor: [
            {
              id: 'existing',
              name: 'Replacement',
              state: { index: 2, length: 1, type: 'byte' },
            },
          ],
        },
      },
      { resolutions: { existing: 'overwrite' } },
    );

    const sensors = result.config.sensor as any[];
    expect(sensors).toHaveLength(1);
    expect(sensors[0].name).toBe('Replacement');
    expect(result.appliedEntityIds).toEqual(['existing']);
  });

  it('skips an existing entity when resolved', () => {
    const result = buildApplyConfig(makeConfig(), makeDraft('existing'), {
      resolutions: { existing: 'skip' },
    });

    const sensors = result.config.sensor as any[];
    expect(sensors).toHaveLength(1);
    expect(sensors[0].name).toBe('Existing Sensor');
    expect(result.appliedEntityIds).toEqual([]);
  });

  it('renames a conflicting entity', () => {
    const result = buildApplyConfig(makeConfig(), makeDraft('existing'), {
      renames: { existing: 'existing_2' },
    });

    const sensors = result.config.sensor as any[];
    expect(sensors.map((sensor) => sensor.id).sort()).toEqual(['existing', 'existing_2']);
    expect(result.appliedEntityIds).toEqual(['existing_2']);
  });

  it('rejects unresolved exact id conflicts', () => {
    try {
      buildApplyConfig(makeConfig(), makeDraft('existing'));
      throw new Error('Expected buildApplyConfig to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigItemsError);
      expect((error as ConfigItemsError).status).toBe(409);
      expect((error as ConfigItemsError).code).toBe('DRAFT_CONFLICT');
    }
  });
});
