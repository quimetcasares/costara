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

## ADR-024: Separación entre plantilla recurrente de producción y plan fechado concreto (Production plan templates distinct from dated production plans)

* **Status**: Aprobado
* **Context**: Los obradores y plantas de producción artesanal operan sobre patrones de demanda y ritmos semanales regulares (ej. producción de lunes a sábado con volúmenes base de masas y surtido). Sin embargo, cada semana real sufre ajustes por pedidos especiales, feriados o disponibilidad de insumos. Si el plan semanal se confunde con la plantilla recurrente, cualquier ajuste temporal destruiría el patrón base del negocio; y si se modela rígidamente, el usuario se ve forzado a recrear la planificación completa desde cero cada semana.
* **Decision**: Separar conceptualmente la plantilla recurrente de producción (`production_plan_templates` y sus items relativos por día de la semana) del plan fechado concreto (`production_plans` y sus `production_targets` específicos por fecha). El plan concreto puede instanciarse a partir de una plantilla y editarse libremente (agregar targets, modificar cantidades o cancelar partidas) sin alterar la plantilla reusable, sin afectar los planes de semanas pasadas, sin mutar recetas y sin crear versiones de receta.
* **Consequences**:
  * *Positivas*: Flujo ágil de planificación semanal con mínima fricción para el usuario, respetando patrones operativos sin perder flexibilidad ni comprometer la historia pasada.
  * *Negativas*: El sistema debe gestionar dos niveles de abstracción: la plantilla estructural abstracta y las instancias de planes fechados.

---

## ADR-025: Requerimientos de insumos e intermedios compartidos como proyección calculada bajo demanda (Production requirements are derived projections, not persisted source entities)

* **Status**: Aprobado
* **Context**: Múltiples productos terminados planificados (ej. 20 Conchas, 4 Pan de Deus, 12 Trenzas, 12 Roles Canela, 6 Roles Philadelphia) consumen y comparten una misma preparación intermedia (Masa Dulce). A su vez, dicha preparación intermedia requiere materias primas base (harina, huevo, mantequilla, etc.). Si los requerimientos consolidados de masas intermedias y compras se persisten prematuramente como entidades fuente en una tabla rígida al crear el plan, cualquier edición posterior a los targets o actualización de recetas provocaría inconsistencias de sincronización. Por otra parte, si la proyección utilizara ingenuamente "la receta activa actual" al consultar un plan histórico, la publicación de nuevas versiones alteraría retroactivamente los requerimientos de semanas pasadas, violando la reproducibilidad histórica.
* **Decision**: Tratar los requerimientos consolidados de producción y compras (explosión de materiales e intermedios compartidos) como una **métrica proyectada y derivada calculada bajo demanda** a partir de la relación entre los `production_targets` del plan y las `recipe_versions` determinadas de forma determinista para la fecha programada de producción (`asOf(target_date)` con `effective_from <= target_date`, conforme a ADR-013 y ADR-020). No se crea una entidad fuente persistida `ProductionRequirement` en M2A. Queda estrictamente prohibido usar "la receta activa al momento de la consulta". Una vez que una corrida de producción física (`production_run`) se materializa o inicia, queda explícitamente vinculada a su `recipe_version_id` exacta e inmutable; publicaciones posteriores de recetas nunca alteran corridas históricas ni hechos ya ejecutados. La disyuntiva sobre si el plan fechado debe congelar la sugerencia de versión al planificarse o resolverla determinísticamente por fecha se documenta como decisión abierta en OPEN-007.
  * *Aclaración de implementación (M2C.0 y consistencia con ADR-030)*: Antes de fijar o confirmar un target puede resolverse dinámicamente la versión publicada aplicable a su `target_date`. Sin embargo, una vez que `production_target.recipe_version_id` ha quedado establecida y congelada, las proyecciones y consultas históricas de dicho target deben calcularse a partir de ese snapshot específico. Una publicación posterior de receta no debe modificar retroactivamente lo que el plan representaba ni sustituir silenciosamente la intención planificada.
* **Consequences**:
  * *Positivas*: Cero riesgo de desincronización entre planes, recetas e insumos consolidados; cálculo determinista y puro basado en el motor de dominio con estricta reproducibilidad histórica.
  * *Negativas*: Requiere ejecutar el algoritmo de agregación y explosión de receta bajo demanda al consultar la vista de preparación de producción.

---

## ADR-026: Ciclo de vida inmutable de ejecución de producción y captura de consumos de baja fricción (Production run lifecycle and low-friction actuals capture)

* **Status**: Aprobado
* **Context**: Registrar la ejecución real de un lote de producción en taller debe ser veloz y honesto. Los operarios no tienen tiempo de reescribir manualmente listas completas de ingredientes pesados en báscula. Al mismo tiempo, una vez finalizado un lote físico, sus resultados reales y consumos validados deben quedar congelados para mantener la integridad histórica y contable.
* **Decision**: Modelar la corrida de producción (`production_runs`) con un ciclo de vida claro: `planned` -> `in_progress` -> `completed` (o `cancelled`), vinculada a la `recipe_version_id` exacta utilizada. La captura de consumos reales (`production_run_inputs`) adopta el principio de baja fricción: el sistema precarga las cantidades planificadas y ofrece al operario una confirmación rápida: "¿Se usaron las cantidades planeadas? (Sí / Hubo cambios)". Si confirma que sí, las cantidades planeadas se asientan como hechos reales validados. Si hubo cambios, únicamente se capturan los insumos que variaron. Al alcanzar el estado `completed`, los resultados y consumos reales quedan fijados de manera inmutable; cualquier corrección posterior deberá ser trazable y no destructiva.
  * *Aclaración de implementación (M2C.0)*: Una corrida en estado `completed` admite válidamente `actual_yield_quantity = 0` (con restricción `actual_yield_quantity >= 0`). Esto modela con fidelidad hechos físicos reales donde hubo ejecución y consumo efectivo de insumos pero cero producto final utilizable (ej. lote quemado, masa contaminada o falla crítica de proceso). En tales casos, los insumos consumidos generan sus correspondientes movimientos `production_input`, pero no se genera ningún movimiento de entrada `production_output`. Por su parte, el estado `cancelled` representa estrictamente la ausencia de hecho físico consumado; una corrida no puede transicionar a `cancelled` si ya existen consumos reales o movimientos de inventario asentados, garantizando que una cancelación nunca oculte la realidad física del inventario.
* **Consequences**:
  * *Positivas*: Adopción amigable en el entorno físico de taller con mínima fricción operativa, garantizando inmutabilidad histórica y trazabilidad total post-cierre.
  * *Negativas*: La interfaz debe soportar un flujo intuitivo de captura por excepción y los servicios deben proteger los registros completados contra modificaciones directas.

---

## ADR-027: Movimientos de inventario generados exclusivamente por hechos operacionales concluidos (Inventory movements generated by completed operational events, not by plans)

* **Status**: Aprobado
* **Context**: Planificar la producción de 10 kg de pan o crear una orden de trabajo no consume físicamente harina ni crea piezas terminadas en el anaquel. Si la planificación afectara directamente los balances de inventario, se distorsionaría la existencia física real disponible para otras operaciones. Al mismo tiempo, el inventario del mundo real no se alimenta únicamente de corridas de taller: ADR-003 contempla conceptualmente entradas por compra/recepción, salidas por producción y venta, ajustes de conteo físico y mermas. Restringir el Kardex a una única entidad fuente impediría la extensibilidad natural de la plataforma.
* **Decision**: Establecer que la planificación (planes y targets) **nunca mueve inventario**. Los movimientos de inventario (`inventory_movements`, ADR-003) se originan exclusivamente a partir de **hechos operacionales concluidos y confirmados**. Un lote de producción finalizado (`production_run` con `status: completed`) es **una fuente operacional legítima** de movimientos (asentando atómicamente salidas de insumos consumidos `production_input` y entradas del producto obtenido `production_output`). Otras fuentes operacionales (como recepciones de compra, ventas comerciales o ajustes de inventario) podrán generar movimientos bajo este mismo modelo inmutable sin alterar la semántica central del Kardex. Cada registro en `inventory_movements` debe conservar referencia y origen explícito para auditar la causa exacta del movimiento.
  * *Nota de implementación (M2B / M2C.0)*: El mecanismo específico de provenance mediante columnas polimórficas `source_entity_type` y `source_entity_id` originalmente previsto en esta ADR queda supersedido por ADR-032. La implementación real adopta enlaces foráneos tipados (`production_run_id`, `production_run_input_id`, `reversal_of_movement_id`) para preservar la integridad referencial relacional, manteniendo intacto el principio central de ADR-027: solo los hechos operacionales confirmados generan movimientos de inventario.
* **Consequences**:
  * *Positivas*: Concordancia absoluta entre el kardex digital de inventario y la realidad física del almacén u obrador en todo momento, con una arquitectura abierta a múltiples fuentes operacionales sin duplicar lógica contable.
  * *Negativas*: Las materias primas asignadas a planes futuros no se bloquean físicamente en inventario; si el negocio requiere pre-asignación o reservas, deberá modelarse como una métrica proyectada y no como una alteración del kardex.

---

## ADR-028: Registro honesto de desviaciones reales de producción sin clasificación automática de merma (Actual production deviations recorded without automatic waste classification)

* **Status**: Aprobado
* **Context**: En la producción física, el rendimiento final obtenido (ej. 3.42 kg de masa) casi siempre difiere del nominal planificado (ej. 3.5 kg). Clasificar de forma automática esa diferencia (80 g) como "merma" o "desperdicio" es falso: puede tratarse de masa en reposo, humedad residual, tolerancia de instrumentos de medición o variación normal del amasado. Además, forzar que la receta se altere para reflejar ese lote destruiría el estándar oficial de formulación.
* **Decision**: Registrar de forma independiente el objetivo planeado y el resultado real obtenido en la corrida física (`production_runs`), conservando la desviación numérica exacta. Costara prohíbe clasificar automáticamente las desviaciones operacionales de M2 como "merma" contable o de descarte; la categorización formal de mermas se difiere a M3. Asimismo, queda prohibido que las desviaciones de un lote modifiquen automáticamente la versión canónica de la receta (`recipe_versions`).
* **Consequences**:
  * *Positivas*: Integridad entre expectativa nominal y realidad empírica, recopilación de datos objetivos para análisis retrospectivo y protección de la estabilidad de las recetas.
  * *Negativas*: Los reportes de M2 deben presentar la desviación como "variación de rendimiento" o "diferencia operativa", evitando terminología apresurada de merma financiera.

---

## ADR-029: Recepción mínima de inventario comprado en M2 (Minimal purchased inventory receipt in M2)

* **Status**: Aprobado
* **Context**: En M2, las corridas de producción (`production_runs`) generan movimientos inmutables de salida de insumos en el Kardex (`inventory_movements`). Si no existe una vía para dar de alta inventario comprado en el taller, los saldos de materias primas (harina, azúcar, mantequilla, etc.) caerían en números negativos perpetuos, destruyendo la utilidad del control de existencias. Sin embargo, el ROADMAP de M2 está estrictamente acotado a la planificación, ejecución y movimientos derivados de producción; diseñar un módulo comercial completo de compras (órdenes de compra, facturación fiscal, cuentas por pagar y flujo comercial de proveedores) causaría una inflación de alcance inaceptable. Al mismo tiempo, registrar las llegadas de insumos como simples "ajustes de inventario" o "saldos iniciales" distorsionaría la semántica contable del Kardex.
* **Decision**: Aprobar la **recepción mínima de inventario** como un hecho operacional simple de almacén durante M2. El sistema permitirá registrar la entrada física directa de stock comprado/recibido (item, cantidad, unidad, fecha, con lote o referencia opcional) generando un movimiento legítimo de entrada en `inventory_movements`. Esta recepción mínima:
  1. No constituye un módulo de compras: no requiere órdenes de compra, facturación, cuentas por pagar ni catálogo comercial rígido de proveedores.
  2. Representa un hecho real y distinguible: genera un movimiento de entrada claramente clasificado como recepción de insumo (`purchase_receipt` o recepción de inventario), diferenciándose conceptual y semánticamente de:
     - saldos iniciales (`initial_balance`);
     - ajustes físicos por conteo (`inventory_adjustment`);
     - entradas de producción (`production_output`);
     - futuras ventas comerciales;
     - futuras mermas de descarte.
* **Consequences**:
  * *Positivas*: Kardex íntegro, limpio y con saldos reales desde M2 sin inflar el alcance hacia un ERP comercial; Panara puede ingresar sus bultos de harina y costales en tres toques; compatible 100% con ADR-003 y con la evolución hacia un módulo de compras formal en hitos futuros.
  * *Negativas*: En M2 no habrá trazabilidad comercial ni contable de órdenes de compra frente a proveedores; los costos de compra seguirán rigiéndose por el historial de costos de ítems (ADR-017) hasta que se aborde el ciclo comercial completo.

---

## ADR-030: Doble preservación de versión de receta entre intención de planificación y ejecución física (Preservation of recipe version in production targets and runs)

* **Status**: Aprobado
* **Context**: Entre el momento en que se planifica una meta de producción (ej. el domingo para el miércoles) y el momento en que se ejecuta la corrida física en taller, la receta del producto puede evolucionar mediante la publicación de una nueva versión (`recipe_versions`). Si el plan no preserva la versión utilizada al crearse, al consultarlo semanas después el cálculo dinámico resolvería una versión distinta, impidiendo saber qué insumos vio o consideró el planificador cuando armó el plan. Además, el modelo actual de Costara permite que una `recipe_version` se publique con `effective_from` pasado (siempre que conserve el orden cronológico estricto respecto a versiones publicadas previas), lo que causaría que publicaciones retroactivas mutaran silenciosamente planes históricos pasados. Por otra parte, si el plan congelara la receta rígidamente sin advertir al operario de una versión más reciente, el taller podría hornear con una formulación obsoleta o errónea.
* **Decision**: Adoptar la **alternativa híbrida mínima** que preserva dos verdades operacionales independientes:
  1. **Intención histórica de planificación**: Cada meta de producción (`production_target`) conserva la referencia `recipe_version_id` correspondiente a la versión utilizada al calcular o confirmar originalmente ese target. Publicaciones posteriores de recetas nunca modifican ni reescriben silenciosamente esta referencia histórica, garantizando la reproducibilidad de lo que vio el usuario al planificar.
  2. **Detección preventiva de cambio antes de ejecutar**: Antes de ejecutar la producción (o al consultar el plan fechado), Costara puede comparar la versión guardada en el target contra la versión oficial aplicable para `target_date`. Si son diferentes, el sistema detecta el cambio y lo hace visible de forma transparente en la interfaz, sin modificar el target histórico silenciosamente.
  3. **Versión realmente utilizada en ejecución**: Cada corrida física de producción (`production_run`) congela explícitamente y de manera inmutable el `recipe_version_id` en el instante en que la corrida física se materializa o inicia (`planned` o `in_progress`). Una publicación posterior de receta mientras el lote está en progreso nunca altera la corrida iniciada. Por su parte, la transición a `completed` congela los resultados reales obtenidos (`actual_yield_quantity`), los consumos reales y los movimientos derivados de inventario, no la versión de receta (que ya quedó fijada desde el inicio).
  4. **Política operativa diferida**: No se formaliza todavía como regla que cualquier operario pueda elegir libremente utilizar versiones históricas anteriores. La política de permisos y flujos de autorización para actualizar un plan o mantener excepcionalmente una versión anterior queda abierta para definirse posteriormente en el flujo operativo y de interfaz (UI).
  * *Nota de implementación vigente (M2C.0)*: La detección preventiva de cambios se encuentra formalmente implementada en la frontera de ejecución (`start-production-run`). No existe sustitución silenciosa de recetas: si la versión congelada en el target difiere de la versión oficial publicada aplicable a `target_date`, el intento de inicio es rechazado de inmediato con error tipado `RECIPE_VERSION_CONFLICT`. La resolución temporal por fecha operacional se calcula estrictamente en la zona horaria oficial del negocio (`business.timezone`), interpretando `target_date` (YYYY-MM-DD) en el calendario local del negocio y no como día UTC. La política de permisos y flujos de autorización para mantener excepcionalmente una versión anterior o actualizar el target continúa diferida a la capa de UI y gestión de políticas.
* **Consequences**:
  * *Positivas*: Blindaje absoluto contra publicaciones retroactivas de recetas; reproducibilidad histórica fidedigna de la intención del planificador y de la realidad física del taller; cero cambios silenciosos de formulación.
  * *Negativas*: Requiere que `production_targets` almacene una referencia foránea a `recipe_version_id` y que la capa de aplicación/UI compare las versiones al desplegar planes con fechas posteriores a publicaciones de receta.
  * *Consecuencia sobre `effective_from` retroactivo*: Se documenta como hecho relevante que el ciclo de vida actual permite publicar una `recipe_version` con `effective_from` pasado (siempre que sea posterior a todas las versiones publicadas previas). Por ello, resolver dinámicamente un plan histórico no es suficiente para preservar la intención del planificador, haciendo indispensable el snapshot en `production_target` para la reproducibilidad, mientras que `production_run` conserva independientemente la verdad de ejecución. En M2A se mantienen intactas las reglas vigentes de `effective_from`.

---

## ADR-031: Conversión interdimensional masa-volumen específica por item con preservación histórica (Item-specific interdimensional mass-volume conversion with historical preservation)

* **Status**: Aprobado
* **Context**: En la operación real de panadería y manufactura alimentaria, ciertos insumos fluidos (como leche, aceite vegetal, miel o jarabes) se compran comúnmente en unidades de volumen (litros, mililitros, galones), pero en el taller se pesan en báscula por masa (gramos, kilogramos) para asegurar exactitud y agilidad. Si Costara prohibiera toda relación entre masa y volumen, no sería posible conciliar una recepción de 2 L de leche contra un consumo de 1850 g en el Kardex. Por otra parte, habilitar conversiones universales o automáticas entre masa y volumen violaría las leyes físicas y la seguridad dimensional (ADR-006), ya que cada fluido tiene densidades distintas (1 L de agua pesa 1000 g, 1 L de miel pesa aprox. 1420 g y 1 L de aceite pesa aprox. 920 g). Asimismo, la densidad operacional de un producto no debe asumirse como una constante eterna o inmutable: puede variar por proveedor, temperatura, concentración de sólidos, reformulación o calibración. Si un movimiento histórico dependiera de consultar dinámicamente la configuración actual de densidad del item, cualquier actualización futura de la densidad reescribiría y falsearía retroactivamente los balances del Kardex pasado.
* **Decision**: Aprobar la **conversión interdimensional explícita masa-volumen específica por item**, sujeta a los siguientes principios de dominio e invariantes de reproducibilidad:
  1. **Unidad base canónica única**: Cada item mantiene una única unidad base canónica (ADR-010). Si la leche se formula y pesa en gramos en el taller, su unidad base canónica es de masa (`g`).
  2. **Seguridad dimensional universal**: Las conversiones universales permanecen estrictamente restringidas a la misma dimensión física (ADR-006). Quedan prohibidas las conversiones automáticas universales entre masa y volumen.
  3. **Factor explícito por item**: Se admite la conversión entre masa y volumen exclusivamente para un item específico cuando dicho item tenga configurado un factor o densidad operacional explícita (ej. Leche entera: $1\text{ ml} = 1.03\text{ g}$, o $1\text{ L} = 1030\text{ g}$).
  4. **Fallo explícito ante ausencia de factor**: Si un item carece de factor de conversión interdimensional configurado, cualquier intento de registrar o mover existencias en una dimensión incompatible con su unidad base debe fallar de forma explícita, exigiendo la configuración del factor o la captura directa en la dimensión canónica.
  5. **Naturaleza del factor (exacto vs. aproximado)**: El factor configurado puede marcarse como exacto o aproximado (`is_approximate`), distinguiendo estándares calibrados de equivalencias empíricas de taller (ADR-018). Si el factor utilizado está configurado como aproximado, la normalización y los saldos derivados conservan esa naturaleza aproximada en su visualización y auditoría.
  6. **Invariante de determinismo y preservación histórica**: **Un movimiento histórico de inventario nunca se recalcula retroactivamente usando una configuración de conversión posterior.** La normalización a la unidad base y los saldos derivados son deterministas y reproducibles en función del factor configurado utilizado al momento del evento. Cada movimiento en el Kardex que provenga de una unidad capturada en dimensión distinta a la base debe preservar de forma inmutable la cantidad y unidad originalmente capturadas, así como la cantidad normalizada a la unidad base calculada con el factor vigente al momento del evento (o una referencia inmutable a dicha conversión). Modificaciones futuras en la densidad del item aplicarán exclusivamente a hechos operacionales futuros.
* **Consequences**:
  * *Positivas*: Conciliación determinista y reproducible en el Kardex para insumos fluidos pesados en báscula (ej. recepción de 2 L de leche normalizada a 2060 g menos consumo de 1850 g deja un saldo neto de 210 g, conservando su naturaleza aproximada si el factor fue configurado como tal); total apego a la seguridad dimensional de ADR-006; blindaje del Kardex histórico contra recálculos indeseados por cambios de densidad.
  * *Negativas*: El motor de normalización de inventario debe verificar la existencia del factor específico del item al recibir unidades de otra dimensión; los registros del Kardex deben preservar tanto la cantidad capturada como el equivalente canónico normalizado fijado al momento del registro.

---

## ADR-032: Provenance tipada de movimientos de inventario sin referencias polimórficas (Typed inventory movement provenance without polymorphic references)

* **Status**: Aprobado
* **Context**: ADR-027 especificó originalmente registrar el origen de cada movimiento de inventario mediante columnas genéricas (`source_entity_type`, `source_entity_id`). En bases de datos relacionales como PostgreSQL, las referencias polimórficas sufren de limitaciones severas: impiden la creación de restricciones de clave foránea (`FOREIGN KEY`) reales, hacen imposible garantizar la integridad referencial a nivel de base de datos, dificultan la navegación relacional de consultas y complican las políticas de seguridad (RLS). Además, para hechos operacionales simples y autónomos (como recepciones de compras `purchase_receipt`, saldos iniciales `initial_balance` o ajustes físicos `inventory_adjustment`), el movimiento de inventario es en sí mismo el hecho fuente, por lo que exigir un identificador de entidad externa crea relaciones artificiales o referencias circulares.
* **Decision**: Reemplazar la estrategia polimórfica de ADR-027 por una **provenance tipada y relacional** en `inventory_movements`:
  1. **Hechos de producción**: Se vinculan mediante claves foráneas reales y tipadas a las entidades correspondientes:
     - `production_output`: Enlaza directamente a `production_run_id` (FK a `production_runs`).
     - `production_input`: Enlaza a `production_run_id` y a la línea específica `production_run_input_id` (FK a `production_run_inputs`).
  2. **Hechos de almacén autónomos**: Para `purchase_receipt`, `initial_balance` e `inventory_adjustment`, el registro en `inventory_movements` constituye en sí mismo el hecho fuente operacional auditable, sin requerir enlaces foráneos artificiales ni referencias polimórficas ficticias.
  3. **Correcciones inmutables (Reversals)**: Las cancelaciones y correcciones adoptan un enlace tipado autorreferencial `reversal_of_movement_id` (FK a `inventory_movements`) con restricción de unicidad (`UNIQUE`), asegurando que un movimiento original solo pueda ser revertido exactamente una vez mediante su inverso exacto append-only, y que una reversión no pueda ser a su vez revertida.
  Se preserva plenamente el principio arquitectónico central de ADR-027: ningún plan mueve existencias; únicamente los hechos operacionales confirmados generan movimientos en el Kardex.
* **Consequences**:
  * *Positivas*: Integridad referencial estricta garantizada por el motor relacional de PostgreSQL (`ON DELETE RESTRICT`), consultas sin joins ambiguos ni casts de texto, validación tipada en triggers/constraints y trazabilidad exacta de salidas por cada insumo consumido.
  * *Negativas*: `inventory_movements` contiene columnas foráneas específicas que son nulas según el tipo de movimiento (`movement_type`).

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
* **Hipótesis y Solución Candidata Fuerte (M2A)**:
  - Evitar por completo la creación de campos o columnas específicas de panadería como `dough_weight_per_piece`.
  - Modelar genéricamente la relación a través de la receta del producto final:
    - Salida de receta (`output`): 4 piezas de Pan de Deus (unidad: `piece`).
    - Insumo directo (`input`): 280 g de Masa Dulce (unidad: `g`).
  - Con esta estructura, Costara puede derivar matemáticamente:
    $$\frac{280\text{ g Masa Dulce}}{4\text{ piezas}} = 70\text{ g Masa Dulce por pieza}$$
  - Esta solución es 100% genérica y aplicable a cualquier industria de manufactura ligera (ej. 50 ml de jarabe por botella, 120 g de relleno por pastel).
* **Condición para Resolución Formal**:
  - Esta solución se mantiene como **candidata fuerte pero permanece en estado OPEN**.
  - No debe cerrarse formalmente como ADR hasta validar su consistencia práctica con el resto de productos del surtido dulce de Panara (Concha, Trenza, Roles de Canela y Roles Philadelphia) y confirmar que la explosión de requerimientos derivados de M2 opera de manera armónica.
* **Restricciones actuales**:
  - NO crear columnas ad-hoc como `dough_weight_per_piece`.
  - NO inventar campos específicos de panadería en el núcleo.
  - NO reinterpretar ni forzar `portion_quantity` para este fin.

---

## OPEN-002: Compra en volumen / consumo en masa

* **Status**: Resuelto formalmente mediante ADR-031 (Conversión interdimensional masa-volumen específica por item con preservación histórica).
* **Fuente**: Validación de insumos de panadería (Leche entera).
* **Hecho real confirmado**:
  - Ciertos insumos fluidos se adquieren comercialmente por volumen (litros o galones), pero en el taller se pesan en báscula por masa (gramos) para mayor precisión y velocidad operativa.
* **Resolución Aprobada (ADR-031)**:
  - Cada item conserva una única unidad base canónica (ADR-010). Para la leche pesada en taller, su unidad base es masa (`g`).
  - No existen conversiones universales automáticas entre masa y volumen.
  - Se admiten conversiones específicas por item mediante factores de densidad explícitos (ej. $1\text{ ml} = 1.03\text{ g}$).
  - Si no existe factor configurado para el item, la operación entre dimensiones falla explícitamente solicitando configuración.
  - **Determinismo e invariante histórico**: La normalización a la unidad base y los saldos derivados son deterministas y reproducibles en función del factor utilizado al registrar el evento. Si el factor es aproximado (`is_approximate = true`), el resultado conserva esa condición. Un movimiento histórico nunca se recalcula retroactivamente si en el futuro se modifica la densidad o factor del item. Los hechos operacionales preservan la cantidad/unidad capturada y el valor normalizado fijado al momento del evento.

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
*  **Decisión pendiente**:
  - Mantener fronteras conceptuales estrictas entre cuatro nociones:
    1. Formulación nominal (receta teórica declarada).
    2. Rendimiento esperado de referencia (ej. 8 piezas).
    3. Ejecución física real (lo que efectivamente se pesa, amasa y hornea).
    4. Merma real registrada (lo que legítimamente se desecha o pierde).
  - La captura de ejecución física y mermas reales pertenece a los hitos de producción (M2) y resultado operativo (M3), no a la formulación nominal de recetas de M1.

---

## OPEN-006: Mecanismo de entrada y recepción de inventario comprado en M2

* **Status**: Resuelto formalmente mediante ADR-029 (Recepción mínima de inventario comprado en M2).
* **Fuente**: Definición del modelo de inventario físico y Kardex en M2.
* **Hecho real confirmado**:
  - Un `production_run` genera salidas de inventario para materias primas consumidas (harina, azúcar, etc.) y entradas para preparaciones intermedias o productos terminados.
  - Para que el inventario de materias primas compradas no sea perpetuamente negativo o inconsistente, se requiere un mecanismo para registrar la existencia inicial o la entrada de compras.
  - La ADR-003 contempla entradas por compra, pero el ROADMAP de M2 acota el hito al registro de producción y movimientos derivados, sin definir un módulo completo de compras a proveedores con órdenes, facturación ni cuentas por pagar.
* **Resolución Aprobada (ADR-029)**:
  - Se aprueba la **Opción A (Recepción mínima de inventario en M2)**.
  - M2 permite registrar una entrada física simple de stock comprado/recibido (item, cantidad, unidad, fecha), generando un movimiento legítimo de entrada en `inventory_movements` clasificado como recepción de insumo (`purchase_receipt`).
  - No constituye un módulo de compras: no incluye órdenes de compra, facturación, proveedores rígidos ni cuentas por pagar.
  - Se distingue conceptualmente de saldos iniciales (`initial_balance`), ajustes físicos (`inventory_adjustment`), salidas/entradas de producción (`production_input`/`production_output`), futuras ventas y futuras mermas.

---

## OPEN-007: Resolución y fijación de recipe_version en planes de producción

* **Status**: Resuelto formalmente mediante ADR-030 (Doble preservación de versión de receta entre intención de planificación y ejecución física).
* **Fuente**: Definición conceptual de requerimientos derivados y planes de producción en M2A.
* **Hecho real / Dilema de modelado**:
  - Las recetas evolucionan en el tiempo a través de versiones históricas inmutables (`recipe_versions`).
  - Cuando se elabora un plan fechado para una fecha $T$, los requerimientos deben proyectarse de forma determinista para esa fecha (ADR-025).
  - Cuando una corrida física (`production_run`) se programa o ejecuta, queda obligatoriamente vinculada a una `recipe_version_id` concreta e inmutable (ADR-026).
  - El ciclo de vida actual permite publicar recetas con `effective_from` pasado (siempre que mantenga el orden cronológico estricto). Si el target no guardara versión, publicaciones retroactivas posteriores reescribirían silenciosamente la intención de planes históricos pasados.
* **Resolución Aprobada (ADR-030)**:
  - Se aprueba la **alternativa híbrida mínima** que preserva dos verdades independientes:
    1. *Intención histórica de planificación*: `production_target` conserva como snapshot la `recipe_version_id` utilizada al calcular o confirmar originalmente el target, garantizando reproducibilidad histórica inmutable.
    2. *Detección preventiva de cambios*: Antes de ejecutar, el sistema compara la versión del target contra la versión oficial vigente en `target_date`. Si difieren, hace visible el cambio en la interfaz sin mutar silenciosamente el target histórico.
    3. *Verdad física de ejecución*: `production_run` congela obligatoriamente la `recipe_version_id` efectivamente utilizada en el taller.
    4. *Política operativa*: La política de permisos/flujo para actualizar un target o mantener excepcionalmente una versión anterior se definirá en el diseño operativo y de UI, sin que M2A asuma que cualquier operador puede elegir versiones arbitrarias libremente.

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

---

### Golden Case M2-001 - Día regular de producción en Panara (Lunes)

* **Propósito**: Demostrar conceptualmente la planificación, la representación de metas de intermedios compartidos, la ejecución física y los movimientos de inventario para una jornada representativa de taller.
* **Naturaleza del caso**: Documento de validación empírica y modelado conceptual; **NO es una ADR ni un cambio de schema**.
* **Composición del día regular (Lunes)**:
  - **Panes en masa / preparaciones**:
    - Masa Natural: 10 kg
    - Masa Granos: 14.5 kg
    - Masa Dulce: 3.5 kg
  - **Productos discretos en piezas**:
    - Focaccia: 1 pieza
    - Panqué de plátano: 1 pieza
  - **Surtido dulce planificado**:
    - 20 Conchas
    - 4 Pan de Deus
    - 12 Trenzas
    - 12 Roles de Canela
    - 6 Roles Philadelphia
* **Evidencia operacional real vs. Estado de derivación**:
  - En la práctica viva de Panara, este surtido dulce cotidiano se abastece normalmente preparando aproximadamente 3.5 kg de Masa Dulce (los viernes la planeación especifica 3 kg).
  - Actualmente, **solo Pan de Deus cuenta con gramaje nominal confirmado y estructurable (70 g de masa cruda por pieza)**. Las cantidades nominales exactas de masa por pieza para Conchas, Trenzas, Roles de Canela y Roles Philadelphia aún no están formalmente confirmadas en la ficha técnica.
  - Por lo tanto, **NO se afirma que Costara ya derive matemáticamente que ese surtido sume exactamente 3.5 kg**.
  - En M2, 3.5 kg de Masa Dulce representa un **objetivo operacional real observado** que el sistema permite capturar y programar directamente.
  - Cuando las recetas de todos los productos del surtido cuenten con las relaciones de consumo suficientes, Costara derivará la proyección matemática agregada y permitirá compararla contra el objetivo operativo de 3.5 kg, sirviendo como valiosa evidencia para validar recetas y mermas de taller.
* **Dinámica conceptual demostrada**:
  1. **Targets con unidades heterogéneas**: El plan consolida metas expresadas en masa (`kg`) y metas en piezas (`piece`) respetando la unidad base de cada item.
  2. **Intermedios compartidos y objetivos de preparación**: El plan representa la necesidad de amasar Masa Dulce como lote intermedio común antes de formar el surtido dulce.
  3. **Escalado sin versionado**: La receta de Masa Dulce se escala proporcionalmente a 3.5 kg para proyectar los insumos de amasado (harina, huevos, azúcar, mantequilla) sin crear una versión de receta.
  4. **Ejecución real y consumos de taller**: Se ejecuta la corrida (`production_run`) de Masa Dulce. El operario pesa y registra un rendimiento real obtenido de 3.42 kg (desviación de 80 g conservada honestamente). Al confirmar los insumos usados mediante captura de baja fricción ("¿Cantidades planeadas? Sí / Hubo cambios"), se asientan los consumos reales.
  5. **Efecto inmutable en inventario**: Al finalizar la corrida de Masa Dulce en estado `completed`, el kardex asienta:
     - Salidas (`production_input`): Harina, huevos, azúcar, mantequilla, etc.
     - Entrada (`production_output`): 3.42 kg de Masa Dulce disponible en taller.
     Posteriormente, al formar y hornear las Conchas y Pan de Deus, las corridas correspondientes consumen Masa Dulce (salida de intermedio) e ingresan piezas terminadas (entrada de producto terminado).

---

### Golden Case M2-002 - Producción de Pan de Deus con Masa Dulce intermedia y resolución candidata de OPEN-001

* **Propósito**: Validar el flujo de producción de un producto final discreto a partir de una preparación intermedia compartida, comprobando la hipótesis de resolución genérica de OPEN-001 sin campos específicos de panadería.
* **Datos de formulación y ejecución**:
  - **Target planificado**: 4 piezas de Pan de Deus (`output_item`: Pan de Deus, `quantity`: 4, `unit`: `piece`).
  - **Receta nominal**:
    - Rendimiento nominal de lote: 4 piezas (`piece`).
    - Insumo directo: 280 g de Masa Dulce (`g`).
    - Insumo directo: 140 g de Crema de Limón (`g`).
    - Insumo directo: 60 g de Brillo de Huevo (`g`).
* **Derivación por pieza**:
  - Cantidad nominal de masa por pieza: $\frac{280\text{ g}}{4\text{ piezas}} = 70\text{ g/pieza}$.
  - Cantidad nominal de crema por pieza: $\frac{140\text{ g}}{4\text{ piezas}} = 35\text{ g/pieza}$.
* **Dinámica en taller y separación de hechos**:
  - Se programa el `production_run` para 4 piezas.
  - En la mesa de formado, el panadero divide porciones reales que pueden promediar 71 g (total masa consumida: 284 g).
  - Al completar el run, se captura:
    - Salida real obtenida: 4 piezas de Pan de Deus.
    - Consumo real registrado: 284 g de Masa Dulce, 140 g de Crema de Limón.
  - La diferencia real de 4 g de masa se asienta fielmente en el run y en el movimiento de inventario, sin mutar la receta canónica (que sigue indicando 280 g nominales) y sin asumir arbitrariamente que esos 4 g son merma.

---

### Golden Case M2-003 - Plan semanal recurrente (Plantilla viva vs. Plan fechado concreto)

* **Propósito**: Demostrar la separación operacional entre el patrón semanal repetitivo y las instancias de producción semanales concretas, sin inventar datos no confirmados.
* **Estructura confirmada de la Plantilla Semanal (`ProductionPlanTemplate`)**:
  - Lunes: Natural 10 kg, Granos 14.5 kg, Dulce 3.5 kg, Focaccia 1 pza, Panqué de plátano 1 pza.
  - Martes: Natural 7.5 kg, 3 hogazas grandes de 620 g, Granos 14.5 kg, Pan de caja 3 pzas, Dulce 3.5 kg.
  - Miércoles: Laminado 12 kg, Pan de ajo 3 kg, Pan de aceituna 3 kg, Dulce 3.5 kg, Focaccia 1 pza.
  - Jueves: Natural 9.5 kg, Grano 3 kg, Dulce 3.5 kg, Panqué de plátano 1 pza.
  - Viernes: Dulce 3 kg, Pan de caja 1 pza, Galletas (chocolate + avena).
  - Sábado: Natural 5.5 kg, Grano 7.5 kg, Dulce 3.5 kg, Pan de caja 2 pzas.
* **Instanciación y autonomía del plan fechado (`ProductionPlan`)**:
  - Para una semana concreta en el calendario, el encargado genera el plan fechado inicializándolo a partir de la plantilla semanal regular de Panara.
  - **Capacidad conceptual de modificación**: El plan fechado es completamente autónomo respecto a la plantilla. Si en una semana determinada el negocio requiere ajustar las cantidades de producción de un día o agregar un producto por pedido extraordinario `[EJEMPLO ILUSTRATIVO HIPOTÉTICO - NO DATO REAL DE PANARA]`, los cambios se aplican exclusivamente sobre los `production_targets` de esa semana.
  - **Invariantes garantizados**:
    1. La plantilla semanal base permanece intacta.
    2. Los planes de semanas pasadas no se modifican.
    3. No se generan nuevas versiones de recetas.
