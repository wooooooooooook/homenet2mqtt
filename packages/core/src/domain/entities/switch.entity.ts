// packages/core/src/domain/entities/switch.entity.ts

import { EntityConfig, CommandSchema } from './base.entity.js';
import { StateSchema, StateSchemaOrCEL } from '../../protocol/types.js';

export interface SwitchEntity extends EntityConfig {
  state: StateSchema;
  state_on?: StateSchemaOrCEL;
  state_off?: StateSchemaOrCEL;
  command_on?: CommandSchema;
  command_off?: CommandSchema;
  command_update?: CommandSchema;
}
