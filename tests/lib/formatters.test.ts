import { describe, it, expect } from 'vitest';
import {
  trimTrailingZeros,
  formatDecimal,
  formatQuantityWithUnit,
  formatPercentage,
  formatMoney,
  formatUnitCost,
  formatPortions,
  formatUnit,
  formatQuantity,
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

  describe('formatUnit', () => {
    it('localizes piece unit according to quantity', () => {
      expect(formatUnit('piece', 1)).toBe('pieza');
      expect(formatUnit('piece', '1')).toBe('pieza');
      expect(formatUnit('piece', -1)).toBe('pieza');
      expect(formatUnit('piece', 8)).toBe('piezas');
      expect(formatUnit('piece', '4')).toBe('piezas');
      expect(formatUnit('piece', 0)).toBe('piezas');
      expect(formatUnit('piece', null)).toBe('piezas');
      expect(formatUnit('piece', undefined)).toBe('piezas');
      expect(formatUnit('piece', '')).toBe('piezas');
      expect(formatUnit('pieza', 1)).toBe('pieza');
      expect(formatUnit('pza', 2)).toBe('piezas');
    });

    it('preserves metric and other unit symbols unmodified', () => {
      expect(formatUnit('g', 500)).toBe('g');
      expect(formatUnit('kg', 1)).toBe('kg');
      expect(formatUnit('ml', 250)).toBe('ml');
      expect(formatUnit('L', 2)).toBe('L');
      expect(formatUnit('cucharada', 1)).toBe('cucharada');
      expect(formatUnit(null)).toBe('');
      expect(formatUnit(undefined)).toBe('');
    });
  });

  describe('formatQuantity', () => {
    it('formats integer quantities without decimals', () => {
      expect(formatQuantity('500.000000000000')).toBe('500');
      expect(formatQuantity(500)).toBe('500');
      expect(formatQuantity(1000)).toBe('1000');
      expect(formatQuantity(0)).toBe('0');
      expect(formatQuantity('0.000000000000')).toBe('0');
      expect(formatQuantity(new CostaraDecimal('8.000000000000'))).toBe('8');
    });

    it('formats finite decimals up to 3 decimals trimming trailing zeros', () => {
      expect(formatQuantity('2.500000000000')).toBe('2.5');
      expect(formatQuantity(2.5)).toBe('2.5');
      expect(formatQuantity(0.25)).toBe('0.25');
      expect(formatQuantity('114.500000000000')).toBe('114.5');
      expect(formatQuantity('22.500000000000')).toBe('22.5');
      expect(formatQuantity('1.234')).toBe('1.234');
    });

    it('formats long repeating or irrational decimals to maximum 3 visible decimals', () => {
      expect(formatQuantity('2571.428571428571')).toBe('2571.429');
      expect(formatQuantity('1428.571428571429')).toBe('1428.571');
      expect(formatQuantity(new CostaraDecimal('0.333333333333'))).toBe('0.333');
      expect(formatQuantity(new CostaraDecimal('0.666666666667'))).toBe('0.667');
      expect(formatQuantity('0.142857142857')).toBe('0.143');
    });

    it('handles negative quantities correctly', () => {
      expect(formatQuantity('-4.500000000000')).toBe('-4.5');
      expect(formatQuantity(-500)).toBe('-500');
    });

    it('handles null, undefined, and empty string safely', () => {
      expect(formatQuantity(null)).toBe('-');
      expect(formatQuantity(undefined)).toBe('-');
      expect(formatQuantity('')).toBe('-');
    });

    it('works seamlessly with formatUnit for piece and metric units', () => {
      expect(`${formatQuantity(8)} ${formatUnit('piece', 8)}`).toBe('8 piezas');
      expect(`${formatQuantity(1)} ${formatUnit('piece', 1)}`).toBe('1 pieza');
      expect(`${formatQuantity('2571.428571428571')} ${formatUnit('g', '2571.428571428571')}`).toBe('2571.429 g');
      expect(`${formatQuantity('114.500000000000')} ${formatUnit('g', '114.500000000000')}`).toBe('114.5 g');
    });
  });
});
