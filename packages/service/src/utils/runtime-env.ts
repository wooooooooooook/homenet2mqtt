import dotenv from 'dotenv';

dotenv.config();

const timezoneOverride = process.env.TIMEZONE?.trim();
const resolvedTimezone = timezoneOverride || 'UTC';

process.env.TZ = resolvedTimezone;
