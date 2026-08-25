import type { CalculationIssue } from '../domain/calculation/types.js';

export interface HumanIssueDisplay {
  readonly title: string;
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly actionHint?: string;
}

export function formatCalculationIssue(issue: CalculationIssue): HumanIssueDisplay {
  const itemName = issue.itemName || 'este ingrediente';

  switch (issue.code) {
    case 'MISSING_PURCHASE_COST':
      return {
        title: 'Costo de compra no registrado',
        message: `No hay ningún costo de compra registrado para "${itemName}". El costo de la receta se muestra como parcial/incompleto.`,
        severity: 'warning',
        actionHint: 'Registra un costo de compra en el catálogo para completar el cálculo.',
      };

    case 'NO_COST_AS_OF_DATE': {
      const firstAvailable = issue.metadata?.firstAvailableCostAt as string | undefined;
      const dateStr = firstAvailable ? new Date(firstAvailable).toLocaleDateString() : '';
      return {
        title: 'Sin costo aplicable a la fecha',
        message: `No existe un costo registrado para "${itemName}" aplicable a la fecha del cálculo.${
          dateStr ? ` El primer costo disponible data del ${dateStr}.` : ''
        }`,
        severity: 'warning',
        actionHint: 'Selecciona una fecha posterior o registra un costo con fecha retroactiva.',
      };
    }

    case 'MISSING_PERCENTAGE_BASE':
      return {
        title: 'Base porcentual faltante',
        message: `El ingrediente "${itemName}" está formulado como porcentaje, pero no tiene ningún ingrediente base seleccionado.`,
        severity: 'error',
        actionHint: 'Edita el borrador y selecciona al menos una base para calcular este porcentaje.',
      };

    case 'NO_RECIPE_FOR_PRODUCED_ITEM':
      return {
        title: 'Preparación sin receta activa',
        message: `El ingrediente "${itemName}" es una preparación intermedia pero no tiene una receta activa configurada.`,
        severity: 'warning',
        actionHint: 'Crea y publica una receta para esta preparación.',
      };

    case 'NO_RECIPE_AS_OF_DATE':
      return {
        title: 'Sin receta vigente a la fecha',
        message: `No existe una versión de receta para "${itemName}" vigente a la fecha del cálculo.`,
        severity: 'warning',
        actionHint: 'Verifica la fecha de vigencia de la receta.',
      };

    case 'AMBIGUOUS_COSTING_SOURCE':
      return {
        title: 'Origen de costo no especificado',
        message: `El ingrediente "${itemName}" puede comprarse o producirse, pero no se ha indicado si debe costearse como compra o preparación interna.`,
        severity: 'warning',
        actionHint: 'Selecciona explícitamente "Comprado" o "Producido" en el insumo.',
      };

    case 'UNRESOLVABLE_OUTPUT_QUANTITY':
      return {
        title: 'Rendimiento no divisible en piezas',
        message: 'Esta receta no define el tamaño de una pieza individual. El escalado se realiza sobre el rendimiento total.',
        severity: 'info',
        actionHint: 'Define una porción por pieza si deseas escalar por número de piezas.',
      };

    case 'CANNOT_SCALE_BY_UNRESOLVABLE_OUTPUT':
      return {
        title: 'Escalado por piezas no disponible',
        message: 'Para escalar esta receta por número de piezas, define primero el tamaño de la porción en la formulación.',
        severity: 'error',
        actionHint: 'Cambia al modo de escalado por rendimiento total o agrega una porción nominal.',
      };

    case 'PERCENTAGE_DEPENDENCY_CYCLE':
      return {
        title: 'Ciclo en ingredientes porcentuales',
        message: `Existe una dependencia circular entre ingredientes: ${issue.path?.join(' -> ') || issue.message}`,
        severity: 'error',
        actionHint: 'Revisa las bases de los ingredientes porcentuales para eliminar el ciclo.',
      };

    case 'RECIPE_DEPENDENCY_CYCLE':
      return {
        title: 'Ciclo en preparaciones anidadas',
        message: `Existe una dependencia circular entre recetas: ${issue.path?.join(' -> ') || issue.message}`,
        severity: 'error',
        actionHint: 'Revisa los insumos intermedios para evitar que una receta se consuma a sí misma.',
      };

    case 'INCOMPATIBLE_PERCENTAGE_BASE_DIMENSIONS':
      return {
        title: 'Unidades incompatibles en la base',
        message: issue.message,
        severity: 'error',
        actionHint: 'Asegúrate de que todos los ingredientes seleccionados como base pertenezcan a la misma dimensión física (ej. masa).',
      };

    case 'INCOMPATIBLE_INPUT_DIMENSION':
      return {
        title: 'Unidad incompatible con el ingrediente',
        message: issue.message,
        severity: 'error',
        actionHint: 'Selecciona una unidad compatible con la dimensión base del ingrediente.',
      };

    case 'INVALID_SCALE_TARGET':
      return {
        title: 'Cantidad objetivo inválida',
        message: 'La cantidad o piezas objetivo deben ser mayores a cero.',
        severity: 'error',
        actionHint: 'Ingresa un valor positivo mayor a cero.',
      };

    default:
      return {
        title: 'Advertencia de formulación',
        message: issue.message,
        severity: issue.severity,
      };
  }
}
