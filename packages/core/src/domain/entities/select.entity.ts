// packages/core/src/domain/entities/select.entity.ts

import { EntityConfig, CommandSchema } from './base.entity.js';
import { StateSchema, LambdaConfig } from '../../protocol/types.js';

export interface SelectEntity extends EntityConfig {
  type: 'select';
  state?: StateSchema;
  options: string[];
  initial_option?: string;
  restore_value?: boolean;
  command_select?: CommandSchema | LambdaConfig;
  state_select?: CommandSchema | LambdaConfig; // lambda for parsing state to option string
  command_update?: CommandSchema;
}
