let timeZone: string | undefined;

export const setTimeZone = (value?: string | null) => {
  const trimmed = value?.trim();
  timeZone = trimmed ? trimmed : undefined;
};

export const getTimeZone = () => timeZone;

export const withTimeZone = (options: Intl.DateTimeFormatOptions = {}) =>
  timeZone ? { ...options, timeZone } : options;

export const formatTime = (
  timestamp: string | number | Date,
  locale?: string | string[],
  options?: Intl.DateTimeFormatOptions,
) => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleTimeString(locale, withTimeZone(options ?? {}));
};

export const formatRelativeTime = (timestamp: number, locale: string = 'ko') => {
  const now = Date.now();
  const diff = now - timestamp;
  const absDiff = Math.abs(diff);

  if (absDiff < 60000) {
    return 'less_than_a_minute';
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  if (absDiff < 3600000) {
    return rtf.format(-Math.floor(absDiff / 60000), 'minute');
  }
  if (absDiff < 86400000) {
    return rtf.format(-Math.floor(absDiff / 3600000), 'hour');
  }
  if (absDiff < 604800000) {
    return rtf.format(-Math.floor(absDiff / 86400000), 'day');
  }

  // Fallback to absolute time for very old logs
  return formatTime(timestamp, locale, {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
};
