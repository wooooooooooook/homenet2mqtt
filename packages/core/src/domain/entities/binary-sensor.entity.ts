// packages/core/src/domain/entities/binary-sensor.entity.ts

import { EntityConfig } from './base.entity.js';
import { StateSchema } from '../../protocol/types.js';

export interface BinarySensorEntity extends EntityConfig {
  type: 'binary_sensor';
  state: StateSchema;
  state_on?: StateSchema;
  state_off?: StateSchema;
}
