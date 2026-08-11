# Registro de Decisiones de Arquitectura (ADRs) - Costara

Este documento registra las decisiones de arquitectura de software fundamentales tomadas para Costara.

---

## ADR-001: Multi-tenancy desde la estructura

* **Status**: Aprobado
* **Context**: Costara debe servir a múltiples pequeños y medianos negocios manteniendo aislamiento total de datos entre empresas.
* **Decision**: Diseñar el modelo de datos y las políticas de seguridad contemplando `business_id` (o equivalente) como dimensión primaria en todas las entidades operativas desde el día cero.
* **Consequences**:
  * *Positivas*: Facilita la escalabilidad multiempresa, previene filtración inadvertida de datos entre clientes y simplifica el cumplimiento de seguridad.
  * *Negativas*: Requiere incluir la dimensión de negocio en todas las consultas, índices y políticas de seguridad (RLS).

---

## ADR-002: Historial antes que estado mutable

* **Status**: Aprobado
* **Context**: Modificar o sobrescribir registros existentes impide entender cómo evolucionó el negocio y destruye la trazabilidad histórica de costos y precios.
* **Decision**: Priorizar la inmutabilidad de los hechos del dominio (eventos ocurridos) sobre la edición directa del estado actual.
* **Consequences**:
  * *Positivas*: Auditoría completa, reconstrucción exacta del estado en cualquier punto del tiempo y base sólida para análisis futuro.
  * *Negativas*: Incremento progresivo del volumen de datos y necesidad de estrategias eficaces de indexación y consulta.

---

## ADR-003: Inventario basado en movimientos

* **Status**: Aprobado
* **Context**: Guardar solo el stock actual (`current_stock`) causa inconsistencias, dificulta identificar discrepancias o mermas y no explica el origen del inventario.
* **Decision**: El inventario disponible se derivará del historial de movimientos (entradas por compra, salidas por producción/venta, ajustes y mermas).
* **Consequences**:
  * *Positivas*: Trazabilidad total de existencias, eliminación de descuadres no explicados y mayor confiabilidad contable.
  * *Negativas*: Las consultas de stock actual requieren agregación de movimientos o vistas materializadas.

---

## ADR-004: Recetas versionables

* **Status**: Aprobado
* **Context**: Las recetas y listas de ingredientes cambian con el tiempo debido a temporadas, costos o mejoras operativas. Si una receta se sobrescribe, las producciones pasadas pierden su costo real original.
* **Decision**: Las recetas se tratarán como estructuras versionadas. Una modificación genera una nueva versión o registro histórico sin alterar las versiones previas asociadas a producciones pasadas.
* **Consequences**:
  * *Positivas*: Cálculo exacto del costo histórico de lotes producidos anteriormente.
  * *Negativas*: Mayor complejidad en la gestión de versiones activas y selección de receta vigente.

---

## ADR-005: Items como abstracción común

* **Status**: Aprobado
* **Context**: Los insumos, productos intermedios (preparaciones) y productos finales comparten atributos como unidades de medida, costos y control de inventario.
* **Decision**: Modelar los recursos del negocio bajo una abstracción unificada de `Item` diferenciada por roles o tipos (materia prima, insumo intermedio, producto terminado).
* **Consequences**:
  * *Positivas*: Modelo de datos más limpio, reutilización de la lógica de inventario, recetas y movimientos.
  * *Negativas*: Requiere validaciones condicionales según la categoría o rol del item.

---

## ADR-006: Unidades dimensionalmente seguras

* **Status**: Aprobado
* **Context**: Convertir cantidades de masa, volumen o unidades físicas de forma errónea arruina el costo y el control de existencias.
* **Decision**: Separar las unidades en dimensiones compatibles (masa, volumen, unidades discretas) y permitir conversiones únicamente dentro de la misma dimensión o mediante factores explícitos definidos por el negocio.
* **Consequences**:
  * *Positivas*: Previene errores graves en cálculos de inventario y formulación de recetas.
  * *Negativas*: Exige validación rigurosa al ingresar nuevas unidades o fórmulas.

---

## ADR-007: Datos fuente separados de métricas derivadas

* **Status**: Aprobado
* **Context**: Mezclar los datos de transacciones fuente con indicadores o métricas agregadas genera redundancia y riesgo de desincronización.
* **Decision**: Mantener los hechos operacionales como única fuente de verdad. Los indicadores (márgenes, costos promedios, rotación) se calcularán on-demand o en vistas derivadas.
* **Consequences**:
  * *Positivas*: Garantía de integridad de datos y facilidad para corregir o mejorar algoritmos de cálculo sin alterar el origen.
  * *Negativas*: Posible impacto en rendimiento en reportes complejos si no se aplican estrategias de caché o proyecciones.

---

## ADR-008: Arquitectura independiente de una industria específica

* **Status**: Aprobado
* **Context**: Aunque el primer caso de uso real es una panadería, Costara busca ser una solución configurable para diversos tipos de negocios de producción.
* **Decision**: No incorporar suposiciones, términos o reglas codificadas de forma rígida (*hardcoded*) exclusivas de panaderías en el núcleo de la arquitectura.
* **Consequences**:
  * *Positivas*: Permite adaptar el sistema a restaurantes, talleres, artesanías o manufactura ligera sin rehacer el núcleo.
  * *Negativas*: Exige un diseño más abstracto e inductivo desde el primer hito.
