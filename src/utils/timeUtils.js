// Reusable date/time helpers for the KOT page.

export const WAIT_WARN_SECONDS = 10 * 60; // highlight amber after 10 min
export const WAIT_CRITICAL_SECONDS = 20 * 60; // highlight red after 20 min

const pad2 = (n) => String(n).padStart(2, '0');

export const parseTimestamp = (value) => new Date(value).getTime();

/** Whole seconds between `createdAt` and `now` (never negative). */
export function getElapsedSeconds(createdAt, now = Date.now()) {
  const created = parseTimestamp(createdAt);
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now - created) / 1000));
}

/**
 * 1 sec     -> "01 sec"
 * 80 sec    -> "01 min 20 sec"
 * 4800 sec  -> "01 hr 20 min"
 */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  if (hours > 0) return `${pad2(hours)} hr ${pad2(minutes)} min`;
  if (minutes > 0) return `${pad2(minutes)} min ${pad2(seconds)} sec`;
  return `${pad2(seconds)} sec`;
}

/** 'normal' | 'warn' | 'critical' */
export function getWaitLevel(totalSeconds) {
  if (totalSeconds >= WAIT_CRITICAL_SECONDS) return 'critical';
  if (totalSeconds >= WAIT_WARN_SECONDS) return 'warn';
  return 'normal';
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const timeWithSecondsFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

const isValid = (d) => d instanceof Date && !Number.isNaN(d.getTime());

export function formatOrderDate(value) {
  const d = new Date(value);
  return isValid(d) ? dateFormatter.format(d) : '—';
}

export function formatOrderTime(value) {
  const d = new Date(value);
  return isValid(d) ? timeFormatter.format(d) : '—';
}

export function formatRefreshTime(date) {
  return isValid(date) ? timeWithSecondsFormatter.format(date) : '—';
}
