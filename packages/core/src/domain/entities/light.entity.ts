// packages/core/src/domain/entities/light.entity.ts

import { EntityConfig, CommandSchema } from './base.entity.js';
import { StateSchema, StateNumSchema } from '../../protocol/types.js';

export interface LightEntity extends EntityConfig {
  type: 'light';
  state: StateSchema;
  state_on?: StateSchema;
  state_off?: StateSchema;

  // Brightness support
  state_brightness?: StateNumSchema;
  command_brightness?: CommandSchema;

  // Color temperature support (mireds)
  state_color_temp?: StateNumSchema;
  command_color_temp?: CommandSchema;
  min_mireds?: number;
  max_mireds?: number;

  // RGB color support
  state_red?: StateNumSchema;
  state_green?: StateNumSchema;
  state_blue?: StateNumSchema;
  command_red?: CommandSchema;
  command_green?: CommandSchema;
  command_blue?: CommandSchema;

  // White value support
  state_white?: StateNumSchema;
  command_white?: CommandSchema;

  // Color mode
  state_color_mode?: StateSchema; // 'rgb', 'color_temp', 'white'

  // Effects
  effect_list?: string[];
  state_effect?: StateSchema;
  command_effect?: CommandSchema;

  // Transition support
  default_transition_length?: number;

  command_on?: CommandSchema;
  command_off?: CommandSchema;
  command_update?: CommandSchema;
}
