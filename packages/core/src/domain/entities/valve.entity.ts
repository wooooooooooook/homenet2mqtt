// packages/core/src/domain/entities/valve.entity.ts

import { EntityConfig, CommandSchema } from './base.entity.js';
import { StateSchema, StateNumSchema } from '../../protocol/types.js';

export interface ValveEntity extends EntityConfig {
  type: 'valve';
  state: StateSchema;
  state_open?: StateSchema;
  state_closed?: StateSchema;
  state_opening?: StateSchema;
  state_closing?: StateSchema;

  // Position support (0-100, where 0 is closed and 100 is fully open)
  state_position?: StateNumSchema;
  command_position?: CommandSchema;

  // Reports whether valve is currently moving
  reports_position?: boolean;

  command_open?: CommandSchema;
  command_close?: CommandSchema;
  command_stop?: CommandSchema;
  command_update?: CommandSchema;
}
