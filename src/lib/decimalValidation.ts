import { CostaraDecimal } from '../domain/calculation/decimal.js';

/**
 * Validates whether a given string is a valid positive decimal (> 0) using CostaraDecimal,
 * strictly avoiding any JavaScript Number or float precision loss.
 */
export function isStrictPositiveDecimalString(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  try {
    const d = new CostaraDecimal(trimmed);
    return !d.isNaN() && d.isFinite() && d.greaterThan(0);
  } catch {
    return false;
  }
}

/**
 * Validates whether a given string is a valid non-negative decimal (>= 0) using CostaraDecimal.
 */
export function isValidDecimalString(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  try {
    const d = new CostaraDecimal(trimmed);
    return !d.isNaN() && d.isFinite();
  } catch {
    return false;
  }
}

/**
 * Computes theoretical portions count from yield and portion quantity strings using CostaraDecimal.
 * Returns formatted decimal string or null.
 */
export function computePortionsCount(
  yieldQty: string | null | undefined,
  portionQty: string | null | undefined
): string | null {
  if (!isStrictPositiveDecimalString(yieldQty) || !isStrictPositiveDecimalString(portionQty)) {
    return null;
  }
  try {
    const y = new CostaraDecimal(yieldQty!.trim());
    const p = new CostaraDecimal(portionQty!.trim());
    return y.dividedBy(p).toString();
  } catch {
    return null;
  }
}
