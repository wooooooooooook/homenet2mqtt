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
