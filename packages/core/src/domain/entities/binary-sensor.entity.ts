// packages/core/src/domain/entities/binary-sensor.entity.ts

import { EntityConfig } from './base.entity.js';
import { StateSchema, StateSchemaOrCEL } from '../../protocol/types.js';

export interface BinarySensorEntity extends EntityConfig {
  state: StateSchema;
  state_on?: StateSchemaOrCEL;
  state_off?: StateSchemaOrCEL;
}
