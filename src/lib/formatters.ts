import { CostaraDecimal } from '../domain/calculation/decimal.js';

/**
 * Trims redundant trailing zeros from a decimal string representation.
 * e.g. "14.000" -> "14", "1.400" -> "1.4", "12.730" -> "12.73", "0.00" -> "0"
 */
export function trimTrailingZeros(val: string): string {
  if (!val.includes('.')) return val;
  const trimmed = val.replace(/\.?0+$/, '');
  return trimmed === '' || trimmed === '-0' ? '0' : trimmed;
}

/**
 * Formats a raw numeric/decimal value with up to maxDecimals places, omitting redundant zeros.
 */
export function formatDecimal(val: CostaraDecimal | string | number | null | undefined, maxDecimals = 3): string {
  if (val === null || val === undefined) return '-';
  const dec = val instanceof CostaraDecimal ? val : new CostaraDecimal(String(val));
  if (dec.isNaN()) return '-';
  const fixed = dec.toFixed(maxDecimals);
  return trimTrailingZeros(fixed);
}

/**
 * Formats a quantity with its unit symbol or code according to human display rules:
 * - If unit is 'g' and value >= 1000g, converts to 'kg' display.
 * - If unit is 'ml' and value >= 1000ml, converts to 'L' display.
 * - Otherwise displays amount + symbol with redundant zeros trimmed.
 */
export function formatQuantityWithUnit(
  amount: CostaraDecimal | string | number | null | undefined,
  unitCodeOrSymbol?: string | null,
  maxDecimals = 3
): string {
  if (amount === null || amount === undefined) return '-';
  const dec = amount instanceof CostaraDecimal ? amount : new CostaraDecimal(String(amount));
  if (dec.isNaN()) return '-';

  const unit = (unitCodeOrSymbol || '').toLowerCase().trim();

  // Automatic scaling of mass
  if (unit === 'g' || unit === 'gram' || unit === 'gramo' || unit === 'gramos') {
    if (dec.greaterThanOrEqualTo(1000)) {
      const inKg = dec.dividedBy(1000);
      return `${formatDecimal(inKg, maxDecimals)} kg`;
    }
    return `${formatDecimal(dec, maxDecimals)} g`;
  }

  // Automatic scaling of volume
  if (unit === 'ml' || unit === 'milliliter' || unit === 'mililitro' || unit === 'mililitros') {
    if (dec.greaterThanOrEqualTo(1000)) {
      const inL = dec.dividedBy(1000);
      return `${formatDecimal(inL, maxDecimals)} L`;
    }
    return `${formatDecimal(dec, maxDecimals)} ml`;
  }

  if (unit === 'piece' || unit === 'pza' || unit === 'pieza' || unit === 'piezas') {
    return `${formatDecimal(dec, 2)} ${dec.equals(1) ? 'pieza' : 'piezas'}`;
  }

  const symbol = unitCodeOrSymbol ? ` ${unitCodeOrSymbol}` : '';
  return `${formatDecimal(dec, maxDecimals)}${symbol}`;
}

/**
 * Formats a percentage value (e.g. 72.0 -> "72%", 12.5 -> "12.5%").
 */
export function formatPercentage(val: CostaraDecimal | string | number | null | undefined, maxDecimals = 2): string {
  if (val === null || val === undefined) return '-';
  const dec = val instanceof CostaraDecimal ? val : new CostaraDecimal(String(val));
  if (dec.isNaN()) return '-';
  return `${formatDecimal(dec, maxDecimals)}%`;
}

/**
 * Formats a monetary amount to 2 fixed decimals with currency code:
 * e.g. "$158.40 MXN" or "$11.31 MXN / pieza".
 */
export function formatMoney(
  amount: CostaraDecimal | string | number | null | undefined,
  currencyCode = 'MXN',
  unitSuffix?: string | null
): string {
  if (amount === null || amount === undefined) return '-';
  const dec = amount instanceof CostaraDecimal ? amount : new CostaraDecimal(String(amount));
  if (dec.isNaN()) return '-';
  const formatted = `$${dec.toFixed(2)} ${currencyCode}`;
  return unitSuffix ? `${formatted} / ${unitSuffix}` : formatted;
}

/**
 * Formats a unit cost with adaptive precision:
 * - For values >= 1: formats with at least 2 decimals, showing up to maxDecimals if fractional (e.g. 1.5 -> "$1.50", 24 -> "$24.00").
 * - For positive values < 1: formats up to maxDecimals omitting redundant trailing zeros (never displays "$0.00").
 * - e.g. 0.024 -> "$0.024 MXN / g", 0.002 -> "$0.002 MXN / g", 0.015 -> "$0.015 MXN / g".
 */
export function formatUnitCost(
  amount: CostaraDecimal | string | number | null | undefined,
  currencyCode = 'MXN',
  unitSuffix?: string | null,
  maxDecimals = 4
): string {
  if (amount === null || amount === undefined) return '-';
  const dec = amount instanceof CostaraDecimal ? amount : new CostaraDecimal(String(amount));
  if (dec.isNaN()) return '-';
  if (dec.isZero()) {
    const formatted = `$0.00 ${currencyCode}`;
    return unitSuffix ? `${formatted} / ${unitSuffix}` : formatted;
  }

  const abs = dec.abs();
  let formattedNum: string;
  if (abs.lessThan(1)) {
    const fixed = dec.toFixed(maxDecimals);
    const trimmed = trimTrailingZeros(fixed);
    if (trimmed.includes('.') && trimmed.split('.')[1].length === 1) {
      formattedNum = `${trimmed}0`;
    } else {
      formattedNum = trimmed;
    }
  } else {
    const fixed4 = dec.toFixed(maxDecimals);
    const trimmed = trimTrailingZeros(fixed4);
    const decimalPart = trimmed.includes('.') ? trimmed.split('.')[1] : '';
    if (decimalPart.length <= 2) {
      formattedNum = dec.toFixed(2);
    } else {
      formattedNum = trimmed;
    }
  }

  const formatted = `$${formattedNum} ${currencyCode}`;
  return unitSuffix ? `${formatted} / ${unitSuffix}` : formatted;
}

/**
 * Formats theoretical or scaled portions (e.g. 14 -> "14 piezas", 12.73 -> "12.73 piezas").
 */
export function formatPortions(portions: CostaraDecimal | string | number | null | undefined): string {
  if (portions === null || portions === undefined) return '-';
  const dec = portions instanceof CostaraDecimal ? portions : new CostaraDecimal(String(portions));
  if (dec.isNaN()) return '-';
  const formatted = formatDecimal(dec, 2);
  return `${formatted} ${dec.equals(1) ? 'pieza' : 'piezas'}`;
}

/**
 * Formats a date or ISO string into localized Spanish date (e.g. "18 ago 2026").
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Formats a date or ISO string into localized date and time (e.g. "18 ago 2026, 14:30").
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
