// packages/core/src/domain/entities/text-sensor.entity.ts

import { EntityConfig } from './base.entity.js';
import { StateSchema, StateNumSchema } from '../../protocol/types.js';

export interface TextSensorEntity extends EntityConfig {
  state?: StateSchema;
  state_text?: StateNumSchema | string;
  initial_value?: string;
}
