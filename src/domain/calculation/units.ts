import { CostaraDecimal } from './decimal.ts';
import type { UnitData, UnitDimensionCode, CanonicalQuantity } from './types.ts';

/**
 * Normalizes a quantity in a specific unit to the universal base unit of its physical dimension.
 * Example: 10 kg -> 10,000 g (dimension: mass, base unit: g).
 */
export function toUniversalDimensionBase(quantity: CostaraDecimal, unit: UnitData): CostaraDecimal {
  return quantity.times(unit.factorToBase);
}

/**
 * Converts a quantity from the universal dimension base unit to a target unit.
 * Example: 10,000 g -> 10 kg.
 */
export function fromUniversalDimensionBase(canonicalQuantity: CostaraDecimal, targetUnit: UnitData): CostaraDecimal {
  return canonicalQuantity.dividedBy(targetUnit.factorToBase);
}

/**
 * Checks if two units belong to the same physical dimension.
 */
export function areUnitsDimensionallyCompatible(unitA: UnitData, unitB: UnitData): boolean {
  return unitA.dimensionId === unitB.dimensionId;
}

/**
 * Validates that an input unit is dimensionally compatible with an item's base unit.
 */
export function isUnitCompatibleWithItem(unit: UnitData, itemBaseUnit: UnitData): boolean {
  return unit.dimensionId === itemBaseUnit.dimensionId;
}

/**
 * Finds the universal base unit (isBase = true) for a given dimension from a collection of units.
 */
export function findUniversalBaseUnit(
  units: ReadonlyMap<string, UnitData> | readonly UnitData[],
  dimensionCode: UnitDimensionCode
): UnitData | undefined {
  const unitList: readonly UnitData[] =
    units instanceof Map ? Array.from(units.values()) : (units as readonly UnitData[]);
  return unitList.find((u: UnitData) => u.dimensionCode === dimensionCode && u.isBase);
}

/**
 * Builds a CanonicalQuantity structure from a quantity and unit.
 */
export function createCanonicalQuantity(
  quantity: CostaraDecimal,
  unit: UnitData,
  universalBaseUnit: UnitData
): CanonicalQuantity {
  const canonicalAmount = toUniversalDimensionBase(quantity, unit);
  return {
    amount: canonicalAmount,
    dimensionCode: unit.dimensionCode,
    universalBaseUnitId: universalBaseUnit.id,
    universalBaseUnitCode: universalBaseUnit.code,
  };
}
