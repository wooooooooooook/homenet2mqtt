// packages/core/src/domain/entities/fan.entity.ts

import { EntityConfig } from './base.entity.js';
import { StateSchema, StateNumSchema } from '../../protocol/types.js';

export interface FanEntity extends EntityConfig {
  type: 'fan';
  state: StateSchema;
  state_on?: StateSchema;
  state_off?: StateSchema;
  state_speed?: StateNumSchema;
}
