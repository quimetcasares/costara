import { describe, it, expect } from 'vitest';
import {
  trimTrailingZeros,
  formatDecimal,
  formatQuantityWithUnit,
  formatPercentage,
  formatMoney,
  formatUnitCost,
  formatPortions,
} from '../../src/lib/formatters.js';
import { CostaraDecimal } from '../../src/domain/calculation/decimal.js';

describe('Formatters Presentation Utilities', () => {
  describe('trimTrailingZeros', () => {
    it('removes trailing zeros and dots correctly', () => {
      expect(trimTrailingZeros('14.000')).toBe('14');
      expect(trimTrailingZeros('1.400')).toBe('1.4');
      expect(trimTrailingZeros('9.42900')).toBe('9.429');
      expect(trimTrailingZeros('100')).toBe('100');
      expect(trimTrailingZeros('0.00')).toBe('0');
      expect(trimTrailingZeros('0.50')).toBe('0.5');
    });
  });

  describe('formatDecimal', () => {
    it('formats CostaraDecimal, string, number and nulls', () => {
      expect(formatDecimal(new CostaraDecimal('14.0000'))).toBe('14');
      expect(formatDecimal('1.4000')).toBe('1.4');
      expect(formatDecimal(9.42857, 3)).toBe('9.429');
      expect(formatDecimal(null)).toBe('-');
      expect(formatDecimal(undefined)).toBe('-');
    });
  });

  describe('formatQuantityWithUnit', () => {
    it('scales mass from g to kg when >= 1000g', () => {
      expect(formatQuantityWithUnit('14000', 'g')).toBe('14 kg');
      expect(formatQuantityWithUnit('1400', 'g')).toBe('1.4 kg');
      expect(formatQuantityWithUnit('9428.57', 'g')).toBe('9.429 kg');
      expect(formatQuantityWithUnit('280', 'g')).toBe('280 g');
      expect(formatQuantityWithUnit('500', 'gramos')).toBe('500 g');
    });

    it('scales volume from ml to L when >= 1000ml', () => {
      expect(formatQuantityWithUnit('2500', 'ml')).toBe('2.5 L');
      expect(formatQuantityWithUnit('500', 'ml')).toBe('500 ml');
    });

    it('formats pieces correctly', () => {
      expect(formatQuantityWithUnit('1', 'piece')).toBe('1 pieza');
      expect(formatQuantityWithUnit('14', 'piece')).toBe('14 piezas');
      expect(formatQuantityWithUnit('12.73', 'piece')).toBe('12.73 piezas');
    });
  });

  describe('formatPercentage', () => {
    it('formats percentage values with percent sign', () => {
      expect(formatPercentage('72')).toBe('72%');
      expect(formatPercentage('72.0')).toBe('72%');
      expect(formatPercentage('12.5')).toBe('12.5%');
      expect(formatPercentage(new CostaraDecimal('2.000'))).toBe('2%');
      expect(formatPercentage(null)).toBe('-');
    });
  });

  describe('formatMoney', () => {
    it('formats monetary values with 2 decimals and currency code', () => {
      expect(formatMoney('158.4')).toBe('$158.40 MXN');
      expect(formatMoney(new CostaraDecimal('11.3142'), 'MXN', 'pieza')).toBe('$11.31 MXN / pieza');
      expect(formatMoney(0)).toBe('$0.00 MXN');
      expect(formatMoney(null)).toBe('-');
    });
  });

  describe('formatUnitCost', () => {
    it('formats small unit costs with adaptive precision without displaying $0.00 (BUG 8)', () => {
      expect(formatUnitCost('0.024', 'MXN', 'g')).toBe('$0.024 MXN / g');
      expect(formatUnitCost('0.028', 'MXN', 'g')).toBe('$0.028 MXN / g');
      expect(formatUnitCost('0.002', 'MXN', 'g')).toBe('$0.002 MXN / g');
      expect(formatUnitCost('0.015', 'MXN', 'g')).toBe('$0.015 MXN / g');
      expect(formatUnitCost(new CostaraDecimal('0.0005'), 'MXN', 'g')).toBe('$0.0005 MXN / g');
    });

    it('formats standard unit costs >= 1 with at least 2 decimals', () => {
      expect(formatUnitCost('1.5', 'MXN', 'pieza')).toBe('$1.50 MXN / pieza');
      expect(formatUnitCost('24', 'MXN', 'kg')).toBe('$24.00 MXN / kg');
      expect(formatUnitCost('29.768571', 'MXN', 'pieza')).toBe('$29.7686 MXN / pieza');
      expect(formatUnitCost(0, 'MXN', 'kg')).toBe('$0.00 MXN / kg');
      expect(formatUnitCost(null)).toBe('-');
    });
  });

  describe('formatPortions', () => {
    it('formats theoretical portions with piece suffix', () => {
      expect(formatPortions('14')).toBe('14 piezas');
      expect(formatPortions('1')).toBe('1 pieza');
      expect(formatPortions('12.7300')).toBe('12.73 piezas');
      expect(formatPortions(null)).toBe('-');
    });
  });
});
