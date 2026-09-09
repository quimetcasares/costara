import { describe, it, expect } from 'vitest';
import { CostaraDecimal, fromDatabaseNumeric, fromDatabaseNumericRequired } from '../calculation/decimal.ts';
import {
  toUniversalDimensionBase,
  fromUniversalDimensionBase,
  areUnitsDimensionallyCompatible,
  findUniversalBaseUnit,
  createCanonicalQuantity,
} from '../calculation/units.ts';
import type { UnitData } from '../calculation/types.ts';

describe('Units and Dimension Normalization', () => {
  const unitG: UnitData = {
    id: 'u-g',
    code: 'g',
    nameSingular: 'gramo',
    namePlural: 'gramos',
    symbol: 'g',
    dimensionId: 'dim-mass',
    dimensionCode: 'mass',
    factorToBase: new CostaraDecimal(1),
    isBase: true,
  };

  const unitKg: UnitData = {
    id: 'u-kg',
    code: 'kg',
    nameSingular: 'kilogramo',
    namePlural: 'kilogramos',
    symbol: 'kg',
    dimensionId: 'dim-mass',
    dimensionCode: 'mass',
    factorToBase: new CostaraDecimal(1000),
    isBase: false,
  };

  const unitMg: UnitData = {
    id: 'u-mg',
    code: 'mg',
    nameSingular: 'miligramo',
    namePlural: 'miligramos',
    symbol: 'mg',
    dimensionId: 'dim-mass',
    dimensionCode: 'mass',
    factorToBase: new CostaraDecimal('0.001'),
    isBase: false,
  };

  const unitMl: UnitData = {
    id: 'u-ml',
    code: 'ml',
    nameSingular: 'mililitro',
    namePlural: 'mililitros',
    symbol: 'ml',
    dimensionId: 'dim-vol',
    dimensionCode: 'volume',
    factorToBase: new CostaraDecimal(1),
    isBase: true,
  };

  const unitL: UnitData = {
    id: 'u-l',
    code: 'l',
    nameSingular: 'litro',
    namePlural: 'litros',
    symbol: 'L',
    dimensionId: 'dim-vol',
    dimensionCode: 'volume',
    factorToBase: new CostaraDecimal(1000),
    isBase: false,
  };

  const unitPiece: UnitData = {
    id: 'u-piece',
    code: 'piece',
    nameSingular: 'pieza',
    namePlural: 'piezas',
    symbol: 'pza',
    dimensionId: 'dim-count',
    dimensionCode: 'count',
    factorToBase: new CostaraDecimal(1),
    isBase: true,
  };

  const allUnits = [unitG, unitKg, unitMg, unitMl, unitL, unitPiece];

  it('1. normalizes 10 kg to 10,000 g canonical mass', () => {
    const qty = new CostaraDecimal(10);
    const canonical = toUniversalDimensionBase(qty, unitKg);
    expect(canonical.toString()).toBe('10000');
  });

  it('2. normalizes 500 mg to 0.5 g canonical mass', () => {
    const qty = new CostaraDecimal(500);
    const canonical = toUniversalDimensionBase(qty, unitMg);
    expect(canonical.toString()).toBe('0.5');
  });

  it('3. converts 10,000 g canonical mass back to 10 kg', () => {
    const canonical = new CostaraDecimal(10000);
    const inKg = fromUniversalDimensionBase(canonical, unitKg);
    expect(inKg.toString()).toBe('10');
  });

  it('4. checks dimensional compatibility within same dimension (kg and g)', () => {
    expect(areUnitsDimensionallyCompatible(unitKg, unitG)).toBe(true);
    expect(areUnitsDimensionallyCompatible(unitL, unitMl)).toBe(true);
  });

  it('5. detects dimensional incompatibility between mass and volume (kg vs L)', () => {
    expect(areUnitsDimensionallyCompatible(unitKg, unitL)).toBe(false);
    expect(areUnitsDimensionallyCompatible(unitG, unitPiece)).toBe(false);
  });

  it('6. finds universal base unit for mass (g) and volume (ml)', () => {
    const baseMass = findUniversalBaseUnit(allUnits, 'mass');
    expect(baseMass?.code).toBe('g');
    expect(baseMass?.isBase).toBe(true);

    const baseVol = findUniversalBaseUnit(allUnits, 'volume');
    expect(baseVol?.code).toBe('ml');
    expect(baseVol?.isBase).toBe(true);
  });

  it('7. builds CanonicalQuantity with correct amount and metadata', () => {
    const cq = createCanonicalQuantity(new CostaraDecimal('2.5'), unitKg, unitG);
    expect(cq.amount.toString()).toBe('2500');
    expect(cq.dimensionCode).toBe('mass');
    expect(cq.universalBaseUnitCode).toBe('g');
  });

  it('8. fromDatabaseNumeric rejects non-string types with TypeError', () => {
    expect(() => fromDatabaseNumeric(123 as unknown as string)).toThrow(TypeError);
    expect(fromDatabaseNumeric('12.345678901234')?.toString()).toBe('12.345678901234');
    expect(fromDatabaseNumeric(null)).toBeNull();
    expect(fromDatabaseNumeric('')).toBeNull();
  });

  it('9. fromDatabaseNumericRequired throws on missing or empty string', () => {
    expect(() => fromDatabaseNumericRequired('', 'field1')).toThrow();
  });
});
