import { CostaraDecimal } from './decimal.js';
import type { CostBreakdownNode, CalculationIssue } from './types.js';

export interface ProducedItemTemplate {
  readonly outputItemId: string;
  readonly recipeId: string;
  readonly recipeVersionId: string;
  readonly referenceCanonicalOutput: CostaraDecimal;
  readonly knownBatchMaterialCost: CostaraDecimal;
  readonly knownUnitMaterialCost?: CostaraDecimal;
  readonly isCostComplete: boolean;
  readonly issues: readonly CalculationIssue[];
  readonly referenceBreakdown: readonly CostBreakdownNode[];
}

export interface AllocatedProducedCost {
  readonly allocatedMaterialCost?: CostaraDecimal;
  readonly unitCostCanonical?: CostaraDecimal;
  readonly isCostComplete: boolean;
  readonly issues: readonly CalculationIssue[];
  readonly scaledChildren?: readonly CostBreakdownNode[];
}

/**
 * Creates an allocation for a consumer from a memoized template.
 * Scales the reference breakdown children proportionally by allocationFactor = requestedQty / referenceOutput.
 */
export function allocateProducedItemCost(params: {
  template: ProducedItemTemplate;
  requestedCanonicalQuantity: CostaraDecimal;
}): AllocatedProducedCost {
  const { template, requestedCanonicalQuantity } = params;

  if (!template.knownUnitMaterialCost || template.referenceCanonicalOutput.isZero()) {
    return {
      allocatedMaterialCost: undefined,
      unitCostCanonical: undefined,
      isCostComplete: false,
      issues: template.issues,
      scaledChildren: undefined,
    };
  }

  const allocatedMaterialCost = requestedCanonicalQuantity.times(template.knownUnitMaterialCost);
  const allocationFactor = requestedCanonicalQuantity.dividedBy(template.referenceCanonicalOutput);

  const scaledChildren = scaleBreakdownChildren(template.referenceBreakdown, allocationFactor);

  return {
    allocatedMaterialCost,
    unitCostCanonical: template.knownUnitMaterialCost,
    isCostComplete: template.isCostComplete,
    issues: template.issues,
    scaledChildren,
  };
}

function scaleBreakdownChildren(
  nodes: readonly CostBreakdownNode[],
  factor: CostaraDecimal
): CostBreakdownNode[] {
  return nodes.map((node) => {
    const scaledCanonical = node.canonicalQuantity.times(factor);
    const scaledRequested = node.requestedQuantity ? node.requestedQuantity.times(factor) : undefined;
    const scaledCost = node.nodeMaterialCost ? node.nodeMaterialCost.times(factor) : undefined;

    return {
      ...node,
      canonicalQuantity: scaledCanonical,
      requestedQuantity: scaledRequested,
      nodeMaterialCost: scaledCost,
      children: node.children ? scaleBreakdownChildren(node.children, factor) : undefined,
    };
  });
}
