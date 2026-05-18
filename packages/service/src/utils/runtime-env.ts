import dotenv from 'dotenv';
import { logger } from '@rs485-homenet/core';

dotenv.config();

const timezoneOverride = process.env.TIMEZONE?.trim();
let resolvedTimezone = timezoneOverride || 'UTC';

if (timezoneOverride) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezoneOverride });
  } catch (e) {
    logger.warn(
      `[RuntimeEnv] Invalid timezone specified: "${timezoneOverride}". Falling back to UTC.`,
    );
    resolvedTimezone = 'UTC';
  }
}

process.env.TZ = resolvedTimezone;
