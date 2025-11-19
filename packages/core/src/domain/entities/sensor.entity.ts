// packages/core/src/domain/entities/sensor.entity.ts

import { EntityConfig } from './base.entity.js';
import { StateSchema, StateNumSchema } from '../../protocol/types.js';

export interface SensorEntity extends EntityConfig {
  type: 'sensor';
  state: StateSchema;
  state_number?: StateNumSchema;
}
