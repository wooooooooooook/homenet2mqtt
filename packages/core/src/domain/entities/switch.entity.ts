// packages/core/src/domain/entities/switch.entity.ts

import { EntityConfig } from './base.entity.js';
import { StateSchema } from '../../protocol/types.js';

export interface SwitchEntity extends EntityConfig {
  type: 'switch';
  state: StateSchema;
  state_on?: StateSchema;
  state_off?: StateSchema;
}
