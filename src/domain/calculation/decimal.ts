import Decimal from 'decimal.js';

/**
 * CostaraDecimal is a dedicated, isolated Decimal constructor for the Costara domain.
 * It is configured with 50 significant digits (sufficient guard digits) and explicit ROUND_HALF_UP rounding.
 * It does NOT mutate the global Decimal configuration.
 */
export const CostaraDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -35,
  toExpPos: 35,
});

export type CostaraDecimal = InstanceType<typeof CostaraDecimal>;

/**
 * Strict parser for numeric strings originating from PostgreSQL numeric(30,12) columns.
 * Enforces that persisted values enter the domain strictly as strings without floating-point degradation.
 */
export function fromDatabaseNumeric(value: string | null | undefined): CostaraDecimal | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new TypeError(
      `fromDatabaseNumeric expected a string from database numeric column, received ${typeof value}`
    );
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return new CostaraDecimal(trimmed);
}

/**
 * Required version of fromDatabaseNumeric for non-nullable numeric database columns.
 */
export function fromDatabaseNumericRequired(value: string, fieldName = 'field'): CostaraDecimal {
  const result = fromDatabaseNumeric(value);
  if (result === null) {
    throw new Error(`Required database numeric column "${fieldName}" is missing or empty`);
  }
  return result;
}

/**
 * Safe helper to construct a CostaraDecimal from internal known numbers/strings (e.g. 100, 0, 1).
 */
export function costaraDecimal(value: string | number | CostaraDecimal | Decimal): CostaraDecimal {
  if (typeof value === 'string' || typeof value === 'number') {
    return new CostaraDecimal(value);
  }
  return value instanceof CostaraDecimal ? value : new CostaraDecimal(String(value));
}

export const DECIMAL_ZERO = new CostaraDecimal(0);
export const DECIMAL_ONE = new CostaraDecimal(1);
export const DECIMAL_HUNDRED = new CostaraDecimal(100);
