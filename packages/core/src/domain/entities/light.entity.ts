// packages/core/src/domain/entities/light.entity.ts

import { EntityConfig } from './base.entity.js';
import { StateSchema } from '../../protocol/types.js';

export interface LightEntity extends EntityConfig {
  type: 'light';
  state: StateSchema;
  state_on?: StateSchema;
  state_off?: StateSchema;
}
