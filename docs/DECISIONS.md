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
* **Decision**: Tratar en la capa global únicamente las unidades físicas universales (ej. `g`, `kg`, `ml`, `l`, `piece`). Los conceptos de presentación, empaque o volumen contextual se modelarán estrictamente como conversiones asociadas a un `Item` específico dentro de un negocio (`item_unit_conversions`).
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

---

## ADR-013: Identidad de receta separada de sus versiones históricas inmutables (Recipe identity separated from immutable historical versions)

* **Status**: Aprobado
* **Context**: Las recetas evolucionan en el tiempo debido a sustitución de ingredientes, ajustes de rendimiento o mejoras de proceso. Si se sobrescribe la receta existente o si cada cambio genera un nuevo item o múltiples entidades de receta paralelas para el mismo producto, se destruye la historia y se vuelve ambiguo resolver qué receta produce qué item.
* **Decision**: Separar la identidad lógica y permanente de una receta (`recipes`), vinculada a un único `output_item_id` principal, de sus versiones concretas (`recipe_versions`). En M1, dentro de un mismo negocio, un item producido tiene como máximo una identidad lógica de `recipe` responsable de producirlo; las variaciones históricas se expresan como `recipe_versions` de esa misma receta. Las versiones publicadas cuentan con `effective_from` y manejan estados (`draft`, `active`, `archived`). Para resolver la formulación aplicable en una fecha $T$, se excluyen borradores (`draft`) y se selecciona la versión publicada más reciente con `effective_from <= T`. Solo puede existir una versión `active` por receta a la vez (la vigente hoy); el paso de `active` a `archived` al publicar una nueva versión es parte del ciclo de vida y no constituye una reescritura destructiva.
* **Consequences**:
  * *Positivas*: Resolución determinista (`output item -> recipe -> recipe_version`), preservación íntegra de la evolución histórica de fórmulas, reproducibilidad exacta de costos pasados y capacidad de trabajar en borradores (`draft`) sin alterar la producción vigente.
  * *Negativas*: Mayor disciplina en la gestión del ciclo de vida de versiones y en la consulta temporal de la versión aplicable para una fecha dada.

---

## ADR-014: Escalado de recetas como operación de planificación y no de versionado (Recipe scaling is planning, not versioning)

* **Status**: Aprobado
* **Context**: En la operación diaria, el negocio requiere planificar lotes de producción para diferentes volúmenes o cantidades de producto (ej. 6, 12, 17 piezas o 14 kg de masa). Si cada cambio de escala generara una nueva versión de receta, el historial de formulaciones oficiales quedaría saturado de registros redundantes que solo difieren por un factor multiplicador.
* **Decision**: Tratar el escalado de una receta como una proyección matemática transitoria, reproducible y derivada ($factor = \text{objetivo} / \text{referencia}$). El escalado es una función de planificación operativa que no muta la versión canónica ni crea registros en `recipe_versions`.
* **Consequences**:
  * *Positivas*: Flexibilidad total para planificar cualquier volumen de lote bajo demanda manteniendo limpio el catálogo de versiones oficiales.
  * *Negativas*: La interfaz y los módulos de cálculo deben calcular y normalizar las cantidades escaladas en tiempo de ejecución.

---

## ADR-015: Separación conceptual entre formulación nominal y ejecución real (Nominal formulation separated from actual execution)

* **Status**: Aprobado
* **Context**: En la manufactura real de bienes físicos, las cantidades efectivamente consumidas y los rendimientos obtenidos varían con frecuencia respecto a la formulación teórica debido a variabilidad de insumos, factores ambientales, merma en proceso o juicio del operador. Tratar cualquier variación como un error del sistema o forzar que los registros reales coincidan ficticiamente con la fórmula teórica oculta la realidad del negocio.
* **Decision**: Establecer una frontera conceptual estricta entre la formulación nominal (`recipe_versions` como expectativa teórica de referencia) y la ejecución física real (modelos futuros de producción que registrarán cantidades planificadas, consumidas y rendimientos reales). Las desviaciones no se tratan como errores, sino como hechos operacionales legítimos y datos valiosos para el aprendizaje del negocio.
* **Consequences**:
  * *Positivas*: Representación honesta de la dinámica de taller/obrador, facilitando la detección de mermas y el refinamiento continuo de fórmulas.
  * *Negativas*: Los modelos futuros de producción deberán mantener campos independientes para registrar expectativas teóricas vs hechos reales.

---

## ADR-016: Insumos de receta porcentuales con bases explícitas y acíclicas (Percentage recipe inputs use explicit input bases)

* **Status**: Aprobado
* **Context**: En diversas industrias (como el *baker's percentage* en panadería o diluciones en formulación química), los insumos se expresan en función de un insumo base o de un grupo compuesto de insumos (ej. 10% de masa madre respecto al total de harina, compuesta por harina blanca y harina integral). Codificar conceptos específicos de industria (como "harina") en el esquema rompería el agnosticismo de Costara, mientras que soportar expresiones matemáticas arbitrarias de texto libre añadiría fragilidad innecesaria.
* **Decision**: Modelar los insumos porcentuales mediante una relación asociativa explícita N:M (`recipe_input_percentage_bases`) que vincula el insumo porcentual con uno o varios insumos base de la misma versión de receta. La red de dependencias entre insumos porcentuales y sus bases debe ser estrictamente acíclica (sin referencias circulares directas ni indirectas), dimensionalmente compatible y determinísticamente resoluble.
* **Consequences**:
  * *Positivas*: Soporte nativo y genérico para porcentajes de panadero y formulaciones proporcionales complejas en cualquier industria de forma estructurada.
  * *Negativas*: Requiere validar la compatibilidad dimensional de las bases compuestas y verificar la ausencia de ciclos durante la publicación y cálculo de la receta.

---

## ADR-017: Histórico para costos de insumos comprados y derivación para items producidos (Purchased material costs are historical; produced item costs are derived)

* **Status**: Aprobado
* **Context**: Los precios de adquisición de insumos comprados fluctúan con el tiempo, mientras que los items elaborados internamente (intermedios y finales) obtienen su costo a partir de los ingredientes de su receta. Almacenar costos manuales estáticos para items producidos crea duplicidad y riesgo de desincronización. Además, ciertos items híbridos pueden comprarse o producirse según la circunstancia.
* **Decision**: Mantener un registro histórico con vigencia temporal (`item_cost_versions`) exclusivamente para insumos adquiridos externamente. El costo directo de los items producidos para una fecha $T$ se deriva recursivamente a partir de la `recipe_version` aplicable en $T$, los costos de insumos comprados (`item_cost_versions`) vigentes en $T$, y recursivamente la `recipe_version` en $T$ para insumos intermedios producidos. Nunca se utiliza la receta actual con costos históricos si dicha receta no era la vigente en $T$. Para items con capacidad dual (`purchasable: true` y `producible: true`), cada insumo de receta (`recipe_inputs`) debe declarar explícitamente su fuente de costeo (`costing_source`: `purchased` | `produced`).
* **Consequences**:
  * *Positivas*: Fuente única de verdad, reconstrucción histórica exacta del costo de un producto en cualquier punto del tiempo ($T$), y eliminación de ambigüedades en items híbridos.
  * *Negativas*: El cálculo histórico de costo de productos anidados exige resolución recursiva temporal del grafo de recetas e insumos.

---

## ADR-018: Conversiones contextuales aproximadas diferenciadas de cantidades canónicas (Approximate contextual conversions are distinct from canonical quantities)

* **Status**: Aprobado
* **Context**: En la práctica de producción, el personal utiliza a menudo unidades de medida operativas o empíricas aproximadas (ej. "1 tanto ≈ 155 g"). Tratar estas medidas como unidades universales exactas rompe la consistencia matemática, pero descartarlas dificulta la captura y adopción por parte de los operarios.
* **Decision**: Extender el modelo de conversiones contextuales (`item_unit_conversions`) incorporando el indicador booleano `is_approximate` (default `false`). Las conversiones aproximadas se emplearán para la interacción humana, visualización y captura rápida, mientras que los cálculos de costeo y normalización canónica permanecen anclados a cantidades absolutas exactas o a relaciones porcentuales formales.
* **Consequences**:
  * *Positivas*: Equilibrio óptimo entre agilidad/empatía operativa en la UI y rigurosidad matemática en el motor de costos.
  * *Negativas*: La lógica de interfaz debe indicar claramente al usuario cuándo una equivalencia es meramente informativa/aproximada.

---

## ADR-019: Costo directo de materiales diferenciado de costo completo y precio de venta (Direct material cost is distinct from full cost and selling price)

* **Status**: Aprobado
* **Context**: El costo integral de manufactura comprende materiales directos, mano de obra, energía/servicios, empaque, merma y prorrateo de costos fijos. En el Hito M1 solo se modelan los materiales directos. Presentar el costo de materiales como "costo total" o ligar automáticamente los precios de venta mediante fórmulas fijas (ej. `precio = costo * 3.3`) genera distorsiones financieras.
* **Decision**: Acotar el alcance de M1 estrictamente a "Costo Directo de Materiales", comunicándolo con total transparencia en la interfaz. El precio de venta se mantiene desacoplado del costo, permitiendo objetivos de margen configurables (general por negocio y específicos por producto) como benchmarks orientativos y no restrictivos. Los insumos producidos internamente se costean siempre a su costo de producción/compra, nunca a su precio de venta.
* **Consequences**:
  * *Positivas*: Honestidad financiera desde el primer hito, arquitectura modular extensible hacia costos completos (mano de obra, servicios, etc.) en hitos posteriores.
  * *Negativas*: Los usuarios deben comprender que el margen sobre materiales directos no equivale a la utilidad neta final del negocio.

---

## ADR-020: Pure TypeScript calculation engine

* **Status**: Aprobado
* **Context**: El motor de cálculo de recetas, escalado y resolución de costos directos de materiales debe ser determinista, fácilmente testeable y completamente desacoplado de la capa de interfaz de usuario y de los mecanismos de persistencia.
* **Decision**: El motor de cálculo reside en `src/domain` como una biblioteca TypeScript pura sin dependencias de React ni del cliente de Supabase. La obtención de datos se abstrae mediante la interfaz `RecipeDataProvider`. El motor exige el parámetro temporal `asOf` explícitamente y nunca consulta silenciosamente la fecha del sistema (`new Date()`).
* **Consequences**:
  * *Positivas*: Máximo determinismo, suite de pruebas unitarias rápida y aislada, alta reusabilidad (tanto en navegador como en edge/backend) y clara separación de responsabilidades entre matemática de dominio e infraestructura.
  * *Negativas*: Requiere implementar adaptadores concretos (`SupabaseRecipeRepository`, `InMemoryRecipeRepository`) para conectar el motor a fuentes de datos.

---

## ADR-021: Exact decimal arithmetic and numeric boundary

* **Status**: Aprobado
* **Context**: Los números de punto flotante estándar de JavaScript (IEEE-754) introducen imprecisiones inaceptables al operar con proporciones y valores monetarios de alta precisión (`numeric(30,12)`). Además, PostgREST serializa los tipos numéricos como números JSON por defecto, degradando la precisión antes de alcanzar el código de dominio.
* **Decision**: Todas las cantidades, porcentajes, rendimientos, factores de conversión y costos se procesan mediante un constructor aislado `CostaraDecimal` (basado en `decimal.js`) con precisión de trabajo de 50 dígitos y redondeo determinista `ROUND_HALF_UP`. Los valores de tipo `numeric` de PostgreSQL se transportan desde PostgREST proyectados explícitamente como `text` antes de su ingesta en el dominio, rechazando conversiones intermedias a `Number`. No se aplica ningún redondeo de negocio ni de presentación dentro del motor M1C.
* **Consequences**:
  * *Positivas*: Exactitud matemática absoluta en la resolución de fórmulas, costos históricos y escalado, eliminando errores de redondeo acumulativo o degradación binaria.
  * *Negativas*: Mayor disciplina en las consultas del adaptador (uso obligatorio de casts `::text`) y manipulación mediante la API de `CostaraDecimal`.

---

## ADR-022: Draft preview separated from published historical resolution

* **Status**: Aprobado
* **Context**: Durante el desarrollo de nuevos productos, el usuario necesita simular y previsualizar costos y escalado de formulaciones en borrador (`draft`) sin que esto altere las fórmulas oficiales vigentes ni cree versiones prematuras en la base de datos. Sin embargo, si un borrador consume un insumo producido intermedio, permitir que resuelva borradores no publicados de recetas hijas generaría ambigüedad recursiva e inestabilidad en el costeo.
* **Decision**: M1C provee dos entry points diferenciados:
  1. `calculatePublishedRecipeAsOf`: Resolución histórica oficial de versiones `published` (`active`/`archived`) vigentes en una fecha de corte `asOf`.
  2. `calculateRecipeDraftPreview`: Previsualización en memoria de una versión `draft` de receta padre.
  Cuando un borrador padre consume un insumo producido (`costing_source: produced`), la sub-receta del insumo producido se resuelve estrictamente a partir de la versión `published` vigente en `asOf`. Nunca se seleccionan automáticamente borradores de recetas hijas.
* **Consequences**:
  * *Positivas*: Permite la experimentación ágil y segura en borradores sin contaminar el historial oficial ni introducir árboles recursivos ambiguos.
  * *Negativas*: Para probar cambios en sub-recetas producidas de forma oficial, el usuario debe publicar formalmente la versión de la sub-receta antes de costearla en recetas compuestas.

---

## ADR-023: Missing cost is not zero

* **Status**: Aprobado
* **Context**: Si a un insumo comprado le falta su registro de costo histórico o si una sub-receta intermedia no puede costearse completamente, asumir un costo de $0.00 distorsionaría gravemente la rentabilidad del negocio y presentaría márgenes ficticios.
* **Decision**: La ausencia de costo nunca equivale a costo cero. El motor preserva siempre la información parcial conocida (`knownBatchMaterialCost`, `knownCostPerOutputUnit` cuando sea derivable), marcando el resultado con `isCostComplete: false`, `status: 'incomplete'`, e informando `issues` estructurados tipados. Al propagarse a recetas padres, los costos parciales continúan identificados como parciales.
* **Consequences**:
  * *Positivas*: Honestidad e integridad financiera absoluta: el usuario obtiene subtotales conocidos útiles sin que el sistema disfrace datos incompletos como costos totales reales.
  * *Negativas*: Las interfaces y capas superiores deben gestionar el estado incompleto y comunicar con claridad los costos faltantes.

---

# Decisiones Abiertas y Hallazgos de Dominio

> [!NOTE]
> Esta sección documenta hechos reales, dudas conceptuales y vacíos de modelado descubiertos durante las etapas de implementación y validación operativa.
>
> **Reglas de gobernanza para esta sección**:
> 1. **NO son ADRs aprobadas**: Ningún elemento aquí contenido autoriza cambios unilaterales en el código o en la base de datos.
> 2. **NO describen el modelo actual**: Representan requerimientos y discrepancias reales que el modelo vigente aún no soporta o resuelve de forma simplificada.
> 3. **Preservación de contexto**: Su propósito es registrar fielmente la realidad observada en taller sin distorsionar el alcance congelado del milestone activo.
> 4. **Resolución formal**: Cuando uno de estos elementos se resuelva mediante una decisión deliberada:
>    - a) Se creará la ADR correspondiente en este mismo documento si impacta la arquitectura o principios de dominio.
>    - b) Se actualizará `docs/DATA_MODEL.md` si se introducen o modifican entidades y campos del esquema vigente.
>    - c) Se actualizará `docs/ROADMAP.md` únicamente si el alcance planificado de algún hito se ve modificado.

---

## OPEN-001: Cantidad nominal de componente por unidad de output

* **Status**: OPEN
* **Fuente**: Golden Case 001 (Pan de Deus con Crema de Limón).
* **Hecho real confirmado**:
  - Rendimiento esperado de la receta: 8 piezas.
  - Para formar cada Pan de Deus se toman nominalmente 70 g de masa cruda (antes de relleno y horneado).
  - Cada pieza recibe además 35 g de Crema de Limón (280 g totales por lote de 8).
* **Problema de modelado**:
  - El modelo actual no representa de forma estructurada "70 g de masa cruda por pieza".
  - Este dato **NO es conceptualmente equivalente** a `portion_quantity`.
  - En el modelo vigente, `portion_quantity` representa una división homogénea del rendimiento de salida para derivar porciones teóricas en la misma dimensión física (`theoretical_portions = reference_yield / portion_quantity`, ej. 14 kg de masa horneada / 1 kg por porción = 14 porciones).
  - En Pan de Deus, la salida declarada es en conteo (8 piezas) mientras que la división de formado es en masa cruda (70 g por pieza). Son dimensiones y etapas de proceso distintas.
* **Decisión pendiente**:
  - Determinar cómo modelar genéricamente cantidades nominales de masa/componente o etapa de proceso por unidad de producto terminado.
* **Líneas de exploración (NO decisiones tomadas)**:
  - Relación a nivel de `recipe_inputs`.
  - Atributo del `item`.
  - Componente o subreceta intermedia de masa.
  - Futura abstracción de etapas de proceso/formado.
* **Restricciones actuales**:
  - NO crear columnas ad-hoc como `dough_weight_per_piece`.
  - NO inventar campos específicos de panadería en el núcleo.
  - NO reinterpretar ni forzar `portion_quantity` para este fin.

---

## OPEN-002: Compra en volumen / consumo en masa

* **Status**: OPEN
* **Fuente**: Validación de insumos de panadería (Leche entera).
* **Hecho real confirmado**:
  - Ciertos insumos fluidos se adquieren comercialmente por volumen (litros o galones), pero en el taller se pesan en báscula por masa (gramos) para mayor precisión y velocidad operativa.
* **Problema de modelado**:
  - La ADR-006 garantiza seguridad dimensional estricta: las conversiones automáticas solo operan dentro de la misma dimensión física (masa con masa, volumen con volumen).
  - Las conversiones específicas por item (`item_unit_conversions`, ADR-009) actualmente están diseñadas para presentaciones y empaques dentro de la dimensión base del item.
* **Decisión pendiente**:
  - Evaluar en un hito futuro cómo representar densidades o factores de conversión inter-dimensionales específicos por item sin debilitar la integridad ni la seguridad dimensional del motor de cálculo.
* **Restricciones actuales**:
  - No resolver en M1. Los insumos fluidos pesados en masa deben modelarse con unidad base de masa (ej. kg) y costos expresados en esa misma dimensión.

---

## OPEN-003: Formulación real completa de Masa Madre

* **Status**: OPEN
* **Fuente**: Hojas de producción de Panara (Masa Madre).
* **Hecho real confirmado**:
  - La receta real utiliza Harina de Fuerza y agua.
  - El rendimiento declarado del lote es de 2 kg.
  - El tamaño de porción/tanto habitual es de 0.155 kg (155 g), rindiendo aproximadamente 12 tantos.
  - El proceso técnico requiere un cultivo/starter previo de masa madre que se refresca periódicamente.
* **Problema de modelado y costeo**:
  - Se desconoce la proporción exacta del inóculo/starter previo y el tratamiento contable de su costo.
  - Se requiere clarificar si existe descarte sistemático en los refrescos y cómo reconciliarlo con el rendimiento real.
* **Aislamiento en Golden Case**:
  - Para no bloquear la validación de Pan de Deus, la Masa Madre se aisló como insumo con costo de prueba explícito (`[TEST COST ISOLATION - NOT REAL PANARA COST]` a $15.00 MXN/kg) y fuente `costing_source: purchased`.
* **Decisión pendiente**:
  - Reconciliar la formulación oficial de refresco y costeo continuo de Masa Madre cuando se cuente con la ficha técnica detallada.

---

## OPEN-004: Empaque dependiente del pedido

* **Status**: OPEN
* **Fuente**: Operación de empaque y despacho en mostrador.
* **Hecho real confirmado**:
  - El material de empaque (bolsas de papel, cajas, domos) no siempre mantiene una relación 1:1 fija con la receta de un producto.
  - Por ejemplo, un cliente que compra 1 pan recibe 1 bolsa, pero si compra 2 o 3 panes pueden empacarse juntos en una sola bolsa grande o caja.
* **Problema de modelado**:
  - Incorporar el empaque como un insumo directo e inmutable dentro de la receta distorsiona el costo real del producto y genera asignaciones erróneas de inventario.
* **Decisión pendiente**:
  - Diseñar en un hito futuro (M2/M3) el costeo de materiales de empaque y presentación a nivel de pedido, empaquetado o regla de despacho (*fulfillment*), manteniéndolo fuera de la formulación básica del producto horneado.

---

## OPEN-005: Remanente, merma esperada y merma real

* **Status**: OPEN
* **Fuente**: Dinámica de formulación, amasado y porcionado en Pan de Deus con Crema de Limón.
* **Hecho real confirmado**:
  - Los pesos conocidos confirmados de la masa de Pan de Deus comprenden:
    - Esponja: 63 g leche + 100 g masa madre + 1 g levadura + 65 g harina de fuerza = 229 g.
    - Resto de masa con masa conocida: 190 g harina + 45 g agua + 4 g sal + 43 g azúcar + 30 g mantequilla + 60 g huevos (como referencia de masa física de la tarjeta) + 3 g vainilla = 375 g.
    - Total de masa física conocida: $229\text{ g} + 375\text{ g} = 604\text{ g}$, más el aporte adicional de la ralladura de 1/2 limón y 1/2 naranja.
  - Para la formulación canónica del huevo, la fuente operativa de verdad sigue siendo 2 piezas de huevo; los 60 g son únicamente una referencia física de taller para entender el balance de masa.
  - El porcionado nominal de salida son 8 piezas x 70 g de masa cruda = 560 g.
  - La formulación contiene por tanto más masa física conocida que los 560 g nominales divididos, existiendo un remanente nominal de al menos aproximadamente $604\text{ g} - 560\text{ g} = 44\text{ g}$, más el aporte de las ralladuras.
  - La cantidad exacta de este remanente no está formalmente establecida porque algunos insumos son discretos/referenciales y existen ralladuras no pesadas.
  - En el taller, ese remanente físico no se desecha automáticamente: puede redistribuirse entre las piezas, moldearse en una pieza adicional más pequeña para consumo interno o venta secundaria, o integrarse a otra masa.
* **Problema conceptual**:
  - Clasificar automáticamente el remanente nominal como "merma" o forzar una cantidad exacta de descarte es un error conceptual que distorsiona la práctica real del negocio.
* **Decisión pendiente**:
  - Mantener fronteras conceptuales estrictas entre cuatro nociones:
    1. Formulación nominal (receta teórica declarada).
    2. Rendimiento esperado de referencia (ej. 8 piezas).
    3. Ejecución física real (lo que efectivamente se pesa, amasa y hornea).
    4. Merma real registrada (lo que legítimamente se desecha o pierde).
  - La captura de ejecución física y mermas reales pertenece a los hitos de producción (M2) y resultado operativo (M3), no a la formulación nominal de recetas de M1.

---

## Registro de Validación de Casos Reales

### Golden Case 001 - Pan de Deus con Crema de Limón

* **Propósito**: Caso de prueba de oro (*Golden Case*) basado en la operación viva de Panara para verificar el motor de cálculo y costeo recursivo M1C sin depender de aproximaciones teóricas ni de datos ciegos de hojas de cálculo.
* **Naturaleza del caso**: Documento de validación empírica y contexto histórico; **NO es una ADR ni un cambio de schema**.
* **Hechos confirmados de la formulación**:
  - **Receta operativa viva**: Refleja la técnica actual de panadería, no un archivo contable estático.
  - **Rendimiento de salida**: 8 piezas (`unit: piece`).
  - **División nominal de masa**: 70 g de masa cruda por pieza antes de relleno y horneado.
  - **Crema de Limón**: 35 g por pieza consumidos en el formado = 280 g asignados al lote (de un rendimiento declarado de 601 g de la subreceta de crema).
  - **Brillo de Huevo**: 1 huevo + 60 g de leche; la preparación completa (120 g nominales) se consume/asigna al lote completo de 8 piezas.
  - **Esponja Pan de Deus**: 229 g consumidos al 100% en la masa (leche 63 g, masa madre aislada 100 g, levadura 1 g, harina de fuerza 65 g).
  - **Huevos en la masa**: 2 piezas de huevo en la receta física son la fuente de verdad. El peso de 60 g por huevo es únicamente una referencia informativa de taller.
  - **Empaque fuera de receta**: Las bolsas o domos no forman parte de los insumos directos de la receta.
  - **Remanente no es merma automática**: La masa excedente no se asume como desperdicio.
  - **Costos de prueba explícitos**: Todos los costos de materias primas utilizados en este caso están etiquetados como costos de prueba (`[TEST COST - NOT REAL PANARA COST]`) con timestamp fijo `2026-01-01T06:00:00.000Z` (medianoche Ciudad de México). No representan los costos comerciales reales de compra de Panara.
  - **Resultados matemáticos verificados con costos de prueba**:
    - Costo directo de materiales del lote (8 piezas): $\approx \$56.14588186356\text{ MXN}$.
    - Costo por pieza: $\approx \$7.01823523294\text{ MXN}$.
  - **Hallazgo técnico capital**: La implementación de este caso descubrió un bug real en M1C (`costingEngine.ts`), donde los insumos exclusivos de subrecetas intermedias no se precargaban en el mapa de items durante la resolución recursiva. Este bug fue subsanado quirúrgicamente con cobertura de pruebas automatizadas.
