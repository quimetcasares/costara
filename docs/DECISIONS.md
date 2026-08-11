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

---

## ADR-009: Unidades universales vs conversiones específicas por item

* **Status**: Aprobado
* **Context**: En la operación cotidiana aparecen términos de empaque o volumen contextual como "costal", "caja", "barra", "taza", "lata" o "charola". Si se tratan como unidades de medida universales, se distorsiona el modelo físico (ej. un costal de harina pesa 25 kg, pero un costal de azúcar pesa 50 kg).
* **Decision**: Tratar en la capa global únicamente las unidades físicas universales (ej. `g`, `kg`, `ml`, `L`, `piece`). Los conceptos de presentación, empaque o volumen contextual se modelarán estrictamente como conversiones asociadas a un `Item` específico dentro de un negocio (`item_unit_conversions`).
* **Consequences**:
  * *Positivas*: Mantiene limpio y numéricamente riguroso el catálogo global de unidades, permitiendo flexibilidad total para que cada negocio defina sus empaques por item.
  * *Negativas*: Requiere que las consultas y cálculos de conversión verifiquen si la unidad es universal o una conversión específica del item antes de normalizar a la unidad base.

---

## ADR-010: Unidad base canónica por item

* **Status**: Aprobado
* **Context**: Los ítems se compran, consumen y venden en diversas presentaciones (costales, gramos, kilogramos, cajas). Para costear e inventariar con precisión sin acumular errores de redondeo, se requiere un estándar único de representación por item.
* **Decision**: Cada item definido en el sistema tendrá asignada una única unidad base canónica perteneciente a su dimensión física (`base_unit_id`). Todas las operaciones operativas (compras, consumos, producciones, movimientos) normalizarán sus cantidades hacia esta unidad base.
* **Consequences**:
  * *Positivas*: Garantiza consistencia absoluta en el cálculo de inventario y costos, simplificando las agregaciones y comparaciones históricas.
  * *Negativas*: Obliga a realizar conversiones de normalización al ingresar transacciones en unidades de presentación distintas a la unidad base.

---

## ADR-011: Independencia entre el tipo de item (kind) y sus capacidades de negocio

* **Status**: Aprobado
* **Context**: La clasificación tradicional de un recurso (materia prima, producto intermedio, producto terminado, empaque) a menudo limita artificialmente la operación. Por ejemplo, una mermelada puede elaborarse internamente o comprarse hecha a un tercero; un producto terminado podría consumirse en otra preparación.
* **Decision**: Separar la clasificación conceptual del item (`kind`) de sus banderas explícitas de capacidad operativa (`purchasable`, `producible`, `sellable`, `track_inventory`).
* **Consequences**:
  * *Positivas*: Alta flexibilidad para respaldar escenarios operativos reales e híbridos sin modificar el esquema ni forzar duplicación de items.
  * *Negativas*: Las validaciones de flujo de trabajo deben basarse en las banderas de capacidad y no únicamente en el `kind` del item.

---

## ADR-012: Desactivación lógica (soft deactivation) para entidades de dominio con referencias históricas

* **Status**: Aprobado
* **Context**: La eliminación física (destructiva) de items, presentaciones o unidades que fueron utilizados en transacciones o recetas pasadas destruye la integridad referencial histórica y rompe la auditoría.
* **Decision**: Adoptar la desactivación lógica mediante la bandera `is_active = false` para items y conversiones específicas. Los registros desactivados se ocultan para nuevas operaciones pero permanecen intactos en la base de datos para respaldar la historia.
* **Consequences**:
  * *Positivas*: Preservación incondicional del historial operativo y consistencia de costos retroactivos.
  * *Negativas*: Las consultas de catálogo activo deben filtrar explícitamente `is_active = true`.
