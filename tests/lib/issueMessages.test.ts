import { describe, it, expect } from 'vitest';
import { formatCalculationIssue } from '../../src/lib/issueMessages.js';
import type { CalculationIssue } from '../../src/domain/calculation/types.js';

describe('Issue Messages Mapping', () => {
  it('formats MISSING_PURCHASE_COST issue', () => {
    const issue: CalculationIssue = {
      code: 'MISSING_PURCHASE_COST',
      message: 'Item has no cost version',
      severity: 'warning',
      itemId: 'it-1',
      itemName: 'Semillas de Girasol',
    };

    const formatted = formatCalculationIssue(issue);
    expect(formatted.title).toBe('Costo de compra no registrado');
    expect(formatted.message).toContain('Semillas de Girasol');
    expect(formatted.severity).toBe('warning');
    expect(formatted.actionHint).toBeDefined();
  });

  it('formats MISSING_PERCENTAGE_BASE issue', () => {
    const issue: CalculationIssue = {
      code: 'MISSING_PERCENTAGE_BASE',
      message: 'Percentage input has no bases',
      severity: 'error',
      itemId: 'it-2',
      itemName: 'Agua Purificada',
    };

    const formatted = formatCalculationIssue(issue);
    expect(formatted.title).toBe('Base porcentual faltante');
    expect(formatted.severity).toBe('error');
    expect(formatted.actionHint).toBeDefined();
  });

  it('formats UNRESOLVABLE_OUTPUT_QUANTITY issue', () => {
    const issue: CalculationIssue = {
      code: 'UNRESOLVABLE_OUTPUT_QUANTITY',
      message: 'Cannot resolve portions',
      severity: 'info',
    };

    const formatted = formatCalculationIssue(issue);
    expect(formatted.title).toBe('Rendimiento no divisible en piezas');
    expect(formatted.severity).toBe('info');
  });

  it('formats NO_RECIPE_FOR_PRODUCED_ITEM issue', () => {
    const issue: CalculationIssue = {
      code: 'NO_RECIPE_FOR_PRODUCED_ITEM',
      message: 'No recipe for produced item',
      severity: 'warning',
      itemName: 'Masa Madre',
    };

    const formatted = formatCalculationIssue(issue);
    expect(formatted.title).toBe('Preparación sin receta activa');
    expect(formatted.message).toContain('Masa Madre');
  });
});
