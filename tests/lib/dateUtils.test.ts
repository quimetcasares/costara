import { describe, it, expect } from 'vitest';
import {
  getLocalDateString,
  getEndOfLocalDayAsUtc,
  getStartOfLocalDayAsUtc,
  convertLocalDateToBusinessUtcIso,
  formatDate,
  formatDateTime,
  formatLocalDateTimeForRpc,
} from '../../src/lib/dateUtils.js';

describe('dateUtils Timezone and As-Of handling (BUG 5 regression tests)', () => {
  it('correctly calculates local calendar date when UTC has crossed into next day but local timezone is still on previous day', () => {
    // 2026-08-19 at 01:30:00 UTC is 2026-08-18 at 19:30:00 in America/Mexico_City (UTC-6)
    const lateUtcInstant = new Date('2026-08-19T01:30:00Z');

    // Without timezone (or UTC), it is Aug 19
    const utcDateStr = lateUtcInstant.toISOString().slice(0, 10);
    expect(utcDateStr).toBe('2026-08-19');

    // With business timezone America/Mexico_City, it MUST be Aug 18
    const localDateStr = getLocalDateString(lateUtcInstant, 'America/Mexico_City');
    expect(localDateStr).toBe('2026-08-18');
  });

  it('correctly calculates local calendar date for positive UTC offsets (e.g. Asia/Tokyo)', () => {
    // 2026-08-18 at 16:00:00 UTC is 2026-08-19 at 01:00:00 in Asia/Tokyo (UTC+9)
    const tokyoInstant = new Date('2026-08-18T16:00:00Z');
    const localDateStr = getLocalDateString(tokyoInstant, 'Asia/Tokyo');
    expect(localDateStr).toBe('2026-08-19');
  });

  it('computes end of local day in UTC correctly for negative timezone offsets', () => {
    // For 2026-08-18 in America/Mexico_City (UTC-6):
    // End of day is 2026-08-18 23:59:59.999 local => 2026-08-19 05:59:59.999 UTC
    const endOfDayUtc = getEndOfLocalDayAsUtc('2026-08-18', 'America/Mexico_City');

    expect(endOfDayUtc.toISOString()).toBe('2026-08-19T05:59:59.999Z');

    // A recipe version published on 2026-08-18 at 18:00 local (2026-08-19 00:00 UTC)
    // is <= endOfDayUtc and therefore included in As-Of calculation
    const publishedAtEveningLocal = new Date('2026-08-19T00:00:00Z');
    expect(publishedAtEveningLocal.getTime()).toBeLessThanOrEqual(endOfDayUtc.getTime());
  });

  it('computes end of local day in UTC correctly when timezone is UTC or omitted', () => {
    const endOfDayUtc = getEndOfLocalDayAsUtc('2026-08-18', 'UTC');
    expect(endOfDayUtc.toISOString()).toBe('2026-08-18T23:59:59.999Z');
  });

  describe('Cost Effective Date local business boundary (BUG 9 regression tests)', () => {
    it('correctly maps 2026-06-01 local start of day to UTC in America/Mexico_City', () => {
      const effectiveUtc = getStartOfLocalDayAsUtc('2026-06-01', 'America/Mexico_City');
      // 2026-06-01 00:00:00 America/Mexico_City (UTC-6) => 2026-06-01T06:00:00.000Z
      expect(effectiveUtc.toISOString()).toBe('2026-06-01T06:00:00.000Z');

      // As-Of on local 2026-05-31 (end of day is 2026-06-01T05:59:59.999Z)
      const asOfPreviousDay = getEndOfLocalDayAsUtc('2026-05-31', 'America/Mexico_City');
      expect(asOfPreviousDay.toISOString()).toBe('2026-06-01T05:59:59.999Z');

      // The previous day As-Of is BEFORE the new cost effective date => uses old cost
      expect(asOfPreviousDay.getTime()).toBeLessThan(effectiveUtc.getTime());

      // As-Of on local 2026-06-01 (end of day is 2026-06-02T05:59:59.999Z)
      const asOfEffectiveDay = getEndOfLocalDayAsUtc('2026-06-01', 'America/Mexico_City');
      expect(asOfEffectiveDay.toISOString()).toBe('2026-06-02T05:59:59.999Z');

      // The effective day As-Of is AFTER/ON the new cost effective date => uses new cost
      expect(asOfEffectiveDay.getTime()).toBeGreaterThanOrEqual(effectiveUtc.getTime());
    });

    it('converts local dates to ISO strings correctly', () => {
      const isoStr = convertLocalDateToBusinessUtcIso('2026-06-01', 'America/Mexico_City');
      expect(isoStr).toBe('2026-06-01T06:00:00.000Z');
    });
  });

  it('formats dates and local datetime RPC strings properly', () => {
    expect(formatDate('2026-08-18T15:30:00Z')).toBeDefined();
    expect(formatDateTime('2026-08-18T15:30:00Z')).toBeDefined();
    expect(formatLocalDateTimeForRpc('2026-08-18T15:30')).toBe('2026-08-18 15:30:00');
    expect(formatLocalDateTimeForRpc('2026-08-18T15:30:45')).toBe('2026-08-18 15:30:45');
  });
});
