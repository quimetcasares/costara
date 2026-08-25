/**
 * Utilities for formatting and handling dates and timestamps for UI display and inputs.
 */

/**
 * Formats a Date object or ISO string to a human-readable date and time.
 * e.g. "15 Jun 2026, 10:00 AM"
 */
export function formatDateTime(dateOrIso: Date | string | null | undefined): string {
  if (!dateOrIso) return '-';
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  if (isNaN(d.getTime())) return '-';

  return d.toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats a Date object or ISO string to a human-readable date.
 * e.g. "15 Jun 2026"
 */
export function formatDate(dateOrIso: Date | string | null | undefined): string {
  if (!dateOrIso) return '-';
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  if (isNaN(d.getTime())) return '-';

  return d.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Returns current local date/time in 'YYYY-MM-DDTHH:mm' format suitable for <input type="datetime-local">.
 */
export function getCurrentLocalDateTimeString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Returns the calendar date string ('YYYY-MM-DD') for a given Date in the specified IANA timezone.
 * Defaults to current time and business timezone (e.g. 'America/Mexico_City').
 */
export function getLocalDateString(date: Date = new Date(), timezone?: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Given a 'YYYY-MM-DD' local calendar date in a specified IANA timezone, returns a UTC Date
 * representing the end of that local day (23:59:59.999) in that business timezone.
 */
export function getEndOfLocalDayAsUtc(dateStr: string, timezone?: string): Date {
  if (!dateStr) return new Date();

  if (!timezone) {
    return new Date(`${dateStr}T23:59:59.999Z`);
  }

  try {
    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return new Date(`${dateStr}T23:59:59.999Z`);
    }

    // Determine UTC offset for this date in the specified timezone
    const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = tzFormatter.formatToParts(noonUtc);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '0';

    const tzYear = parseInt(getPart('year'), 10);
    const tzMonth = parseInt(getPart('month'), 10) - 1;
    const tzDay = parseInt(getPart('day'), 10);
    let tzHour = parseInt(getPart('hour'), 10);
    if (tzHour === 24) tzHour = 0;
    const tzMinute = parseInt(getPart('minute'), 10);
    const tzSecond = parseInt(getPart('second'), 10);

    const tzTimeAsUtcMs = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond);
    const offsetMs = tzTimeAsUtcMs - noonUtc.getTime();

    const localEndOfDayMs = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
    return new Date(localEndOfDayMs - offsetMs);
  } catch {
    return new Date(`${dateStr}T23:59:59.999Z`);
  }
}

/**
 * Given a 'YYYY-MM-DD' local calendar date in a specified IANA timezone, returns a UTC Date
 * representing the start of that local day (00:00:00.000) in that business timezone.
 */
export function getStartOfLocalDayAsUtc(dateStr: string, timezone?: string): Date {
  if (!dateStr) return new Date();

  if (!timezone) {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }

  try {
    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return new Date(`${dateStr}T00:00:00.000Z`);
    }

    // Determine UTC offset for this date in the specified timezone
    const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = tzFormatter.formatToParts(noonUtc);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '0';

    const tzYear = parseInt(getPart('year'), 10);
    const tzMonth = parseInt(getPart('month'), 10) - 1;
    const tzDay = parseInt(getPart('day'), 10);
    let tzHour = parseInt(getPart('hour'), 10);
    if (tzHour === 24) tzHour = 0;
    const tzMinute = parseInt(getPart('minute'), 10);
    const tzSecond = parseInt(getPart('second'), 10);

    const tzTimeAsUtcMs = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMinute, tzSecond);
    const offsetMs = tzTimeAsUtcMs - noonUtc.getTime();

    const localStartOfDayMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    return new Date(localStartOfDayMs - offsetMs);
  } catch {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
}

/**
 * Converts a local date or datetime string (e.g. '2026-06-01' or '2026-06-01 00:00:00')
 * in a business timezone to an ISO 8601 UTC string (e.g. '2026-06-01T06:00:00.000Z').
 */
export function convertLocalDateToBusinessUtcIso(dateStr: string, timezone?: string): string {
  const d = getStartOfLocalDayAsUtc(dateStr.slice(0, 10), timezone);
  return d.toISOString();
}

/**
 * Converts a 'YYYY-MM-DDTHH:mm' or 'YYYY-MM-DDTHH:mm:ss' input string into a standard SQL timestamp string:
 * e.g. "2026-08-18 15:30:00"
 */
export function formatLocalDateTimeForRpc(input: string): string {
  if (!input) return '';
  const clean = input.replace('T', ' ');
  if (clean.split(':').length === 2) {
    return `${clean}:00`;
  }
  return clean;
}
