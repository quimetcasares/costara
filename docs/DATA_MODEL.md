# Modelo de Datos y Principios del Dominio - Costara (M0, M1 & M2)

Este documento define el modelo conceptual de dominio para Costara, sus entidades fundamentales, relaciones, invariantes, reglas de cálculo y escenarios de aceptación. En esta etapa (M2B + M2C.0), el modelo abarca desde la fundación (M0), formulación de recetas y costos directos (M1), hasta la planificación de producción, ejecución física en taller, conversiones interdimensionales de densidad y movimientos inmutables de inventario (M2).

---

## 1. Objetivo del Modelo de Dominio

Establecer las bases conceptuales para representar:
- Negocios y usuarios con aislamiento multi-tenant estricto.
- Unidades de medida universales, dimensiones físicas y aliases de interpretación.
- Catálogo de items (insumos comprados, preparaciones intermedias, productos terminados y empaques).
- Conversiones contextuales específicas por item (exactas y aproximadas).
- Identidad de recetas y su evolución a través de versiones históricas inmutables.
- Formulación flexible mediante cantidades absolutas y relaciones porcentuales sobre bases simples o compuestas.
- Rendimiento de referencia, porciones y derivación de porciones teóricas.
- Escalado dinámico para planificación de producción sin mutación de versiones canónicas.
- Historial de costos directos de adquisición de insumos comprados con vigencia temporal.
- Costeo recursivo de items elaborados internamente (recetas anidadas).
- Diferenciación entre el costo directo de materiales y las capas futuras de costo completo y precios comerciales.
- Patrones de planificación recurrente y planes de producción fechados e independientes.
- Objetivos de producción heterogéneos (por masa y unidades discretas).
- Derivación bajo demanda de requerimientos de insumos y preparaciones intermedias compartidas.
- Registro y ciclo de vida de corridas de producción física (`planned` -> `in_progress` -> `completed` / `cancelled`).
- Captura de consumos reales con mínima fricción y registro de insumos adicionales no planeados.
- Preservación honesta de desviaciones de taller sin mutación de recetas ni clasificación automática de merma.
- Densidad operacional masa-volumen específica por item con indicador de aproximación.
- Kardex de movimientos de inventario inmutables generados exclusivamente por eventos concluidos, con provenance tipada y reversiones append-only.

Este diseño respalda la filosofía central de Costara: **"Specific today, configurable tomorrow, extensible always"**, permitiendo que el primer caso de validación real (panadería) se modele de forma natural sin condicionar la arquitectura para otros sectores de manufactura ligera o producción.

---

## 2. Separación Global vs. Propiedad del Negocio (Tenant-owned)

Para garantizar la seguridad y el aislamiento multi-tenant desde la estructura de datos:

### Entidades Globales (Compartidas por toda la plataforma)
- `unit_dimensions`: Dimensiones físicas universales (`mass`, `volume`, `count`, `length`).
- `units`: Unidades de medida estándar universales (`g`, `kg`, `ml`, `l`, `piece`, `mm`, `cm`, `m`).
- `unit_aliases` (globales, donde `business_id` es `NULL`): Sinónimos universales (`KGS` -> `kg`, `PZA` -> `piece`).

### Entidades Propiedad del Negocio (Tenant-owned, requieren `business_id`)
- `businesses`: Empresa o negocio registrado en Costara.
- `business_members`: Relación de membresía y roles de usuarios con los negocios.
- `items`: Catálogo unificado de recursos del negocio.
- `item_unit_conversions`: Presentaciones, empaques o medidas contextuales por item (con soporte para `is_approximate`).
- `item_densities`: Densidad operacional masa-volumen específica por item (con soporte para `is_approximate`).
- `unit_aliases` (personalizados, donde `business_id` está definido): Aliases locales del negocio.
- `recipes`: Identidad lógica y permanente de una receta vinculada a un item de salida.
- `recipe_versions`: Versiones históricas de formulación (`draft`, `active`, `archived`).
- `recipe_inputs`: Insumos requeridos por una versión de receta (modo absoluto o porcentual).
- `recipe_input_percentage_bases`: Relación asociativa explícita de insumos que componen una base porcentual.
- `item_cost_versions`: Historial de costos directos de adquisición para insumos comprados.
- `production_plan_templates`: Patrón recurrente de planificación semanal o periódica.
- `production_plan_template_items`: Metas de producción relativas por día dentro de la plantilla.
- `production_plans`: Instancia concreta y fechada de un plan de producción.
- `production_targets`: Objetivos específicos de producción (item, cantidad, unidad, fecha, versión congelada) del plan.
- `production_runs`: Ejecución física de un lote vinculado a una versión aprobada de receta y opcionalmente a un target.
- `production_run_inputs`: Insumos planificados y consumos reales (nominales y no planeados) en la corrida de taller.
- `inventory_movements`: Registro inmutable tipo Kardex de entradas, salidas y reversiones con provenance tipada.

---

## 3. Especificación de Entidades Conceptual de M0

### 3.1 `businesses`
Representa cada negocio o empresa registrada dentro de Costara.

**Campos conceptuales:**
- `id`: UUID (Primary Key). Identificador único universal del negocio.
- `name`: `text` (required). Nombre comercial o identificador del negocio.
- `currency_code`: `text` (default `'MXN'`). Código ISO 4217 de la moneda predeterminada.
- `timezone`: `text` (default `'America/Mexico_City'`). Zona horaria oficial del negocio.
- `created_at`: `timestamptz`. Fecha y hora de creación.
- `updated_at`: `timestamptz`. Fecha y hora de última actualización.

*Nota:* No se incluyen en esta etapa campos fiscales, dirección, branding/logo, planes ni facturación.

---

### 3.2 `business_members`
Relaciona a los usuarios autenticados (`auth.users`) con los negocios a los que tienen acceso.

**Campos conceptuales:**
- `business_id`: UUID (FK a `businesses`). Identificador del negocio.
- `user_id`: UUID (FK a la tabla de usuarios de autenticación `auth.users`).
- `role`: Enum/Text (`owner` | `admin` | `member`). Rol operativo dentro del negocio.
- `created_at`: `timestamptz`. Fecha de asociación.

**Invariantes:**
- La identidad lógica única de la relación es el par `(business_id, user_id)`.
- Un mismo usuario puede ser miembro de múltiples negocios con roles independientes.

---

### 3.3 `unit_dimensions`
Representa las dimensiones físicas compatibles del mundo real.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `code`: `text` (unique). Identificador canónico corto.
- `name`: `text`. Nombre descriptivo.

**Dimensiones iniciales en M0:**
- `mass` (Masa)
- `volume` (Volumen)
- `count` (Conteo / Unidades discretas)
- `length` (Longitud)

*Nota:* Dimensiones como tiempo (`time`) o temperatura (`temperature`) se añadirán en hitos posteriores al construir procesos productivos.

---

### 3.4 `units`
Unidades de medida universales reconocidas por la plataforma Costara.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `dimension_id`: UUID (FK a `unit_dimensions`). Dimensión física a la que pertenece.
- `code`: `text` (unique). Código canónico universal en lowercase (ej. `mg`, `g`, `kg`, `ml`, `l`, `piece`, `mm`, `cm`, `m`).
- `name_singular`: `text`. Nombre en singular (ej. "gramo").
- `name_plural`: `text`. Nombre en plural (ej. "gramos").
- `symbol`: `text`. Símbolo impreso/visible (ej. `g`, `L`).
- `factor_to_base`: `numeric` de alta precisión. Factor de conversión hacia la unidad base de la dimensión.
- `is_base`: `boolean`. Indica si es la unidad base canónica de su dimensión.

**Unidades base iniciales (`factor_to_base = 1`, `is_base = true`):**
- Masa: `gram` (`g`), factor 1
- Volumen: `milliliter` (`ml`), factor 1
- Conteo: `piece` (`piece`), factor 1
- Longitud: `millimeter` (`mm`), factor 1

**Otras unidades iniciales universales:**
- Masa: `mg` (`0.001 g`), `kg` (`1000 g`)
- Volumen: `l` (`1000 ml`, símbolo impreso `L`)
- Longitud: `cm` (`10 mm`), `m` (`1000 mm`)

**Reglas e Invariantes:**
- `factor_to_base` debe ser estrictamente mayor a 0.
- Solo debe existir exactamente una unidad base (`is_base = true`) por dimensión.
- Las conversiones universales ocurren automáticamente **únicamente dentro de la misma dimensión**.
- **No existe conversión universal automática entre dimensiones distintas** (ej. `kg` no se convierte a `l` sin una densidad o conversión explícita).

---

### 3.5 `unit_aliases`
Permite interpretar y mapear diversas variantes textuales humanas hacia una unidad universal de Costara.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (nullable, FK a `businesses`). Si es `NULL`, el alias es global. Si contiene un `business_id`, pertenece exclusivamente a ese negocio.
- `unit_id`: UUID (FK a `units`). Unidad universal a la que mapea el alias.
- `alias`: `text`. Texto del alias (ej. `"KGS"`, `"GRS."`).
- `created_at`: `timestamptz`.

**Aliases globales iniciales esperados:**
- `KGS` -> `kg`
- `GRS` -> `g`
- `GRS.` -> `g`
- `LT` -> `l`
- `LTS` -> `l`
- `PZA` -> `piece`
- `PZAS` -> `piece`

**Estrategia u Orden de Resolución de Aliases:**
La resolución de texto hacia una unidad sigue estrictamente el siguiente orden jerárquico:
1. **Código Canónico Global**: Coincidencia exacta con el `code` de una unidad en `units`.
2. **Alias Personalizado del Negocio**: Coincidencia con `alias` en `unit_aliases` donde `business_id` coincide con el negocio actual.
3. **Alias Global**: Coincidencia con `alias` en `unit_aliases` donde `business_id IS NULL`.
4. **Sin coincidencia (Unresolved)**: Si no se encuentra coincidencia en los pasos 1-3, la entrada requiere configuración o intervención manual.

**Reglas de Resolución:**
- La resolución se realiza de forma **case-insensitive** (sin distinguir mayúsculas de minúsculas).
- **Protección de Códigos Canónicos**: Un alias personalizado de un negocio **NO** puede sobrescribir ni apropiarse de un código canónico global existente de Costara. Ejemplo: `"kg"` siempre resolverá al código canónico `kilogram`; un negocio no puede mapear `"kg"` a `piece`.
- **Sin Ambigüedad**: Un mismo alias dentro de un mismo alcance (global o tenant) no debe mapear a dos unidades distintas.

---

### 3.6 `items`
Abstracción central para cualquier recurso que el negocio puede comprar, producir, consumir, almacenar, empacar o vender.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`). Negocio propietario.
- `name`: `text`. Nombre del item (ej. "Harina de Trigo", "Chocolatín", "Caja para pastel").
- `kind`: `text` (`raw_material` | `intermediate` | `finished_product` | `packaging`). Categoría u origen del item.
- `base_unit_id`: UUID (FK a `units`). Unidad base canónica del item (ej. `g`, `ml`, `piece`).
- `purchasable`: `boolean`. Indica si el item se compra a proveedores.
- `producible`: `boolean`. Indica si el item se elabora mediante un proceso interno/receta.
- `sellable`: `boolean`. Indica si el item se comercializa a clientes.
- `track_inventory`: `boolean`. Indica si se lleva control de existencias.
- `is_active`: `boolean` (default `true`). Estado de activación del item (desactivación lógica).
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Independencia entre `kind` y Capacidades (Bandera de Comportamiento):**
El tipo (`kind`) describe la naturaleza conceptual del item, pero **NO determina de forma rígida sus capacidades de negocio**. Las capacidades se controlan mediante las banderas booleanas:
- **Harina**: `kind: raw_material`, `purchasable: true`, `producible: false`, `sellable: false`.
- **Chocolatín**: `kind: finished_product`, `purchasable: false`, `producible: true`, `sellable: true`.
- **Mermelada de Fresa**: `kind: intermediate`, puede tener `purchasable: true`, `producible: true` y `sellable: true` simultáneamente.

**Unidad Base Canónica del Item:**
Cada item tiene asociada una **única unidad base canónica** (`base_unit_id`), la cual pertenece obligatoriamente a una dimensión física universal (`mass`, `volume`, `count`, `length`). Todas las cantidades relativas a este item (compras, consumos, stock) se normalizarán internamente hacia esta unidad base.
Ejemplos:
- Harina -> `g`
- Leche -> `ml`
- Huevo -> `piece`
- Chocolatín -> `piece`

---

### 3.7 `item_unit_conversions` (con soporte para `is_approximate`)
Representa empaques, contenedores, presentaciones o medidas operativas **específicas de un item dentro de un negocio**.

**Aclaración Fundamental:** Conceptos contextuales o volumétricos de empaque como `costal`, `caja`, `barra`, `lata`, `taza`, `charola`, `paquete` o `tanto` **NO son unidades universales de medida** y **NUNCA deben agregarse a `units`**. Son conversiones específicas dependientes de la densidad, masa o empaque de un item concreto.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`). Negocio propietario.
- `item_id`: UUID (FK a `items`). Item al que aplica la conversión.
- `name_singular`: `text`. Nombre de la presentación en singular (ej. "Costal", "Caja", "Barra", "Taza", "Tanto").
- `name_plural`: `text` (nullable). Nombre en plural (ej. "Costales", "Cajas").
- `quantity`: `numeric` de alta precisión exacto (> 0). Cantidad contenida.
- `unit_id`: UUID (FK a `units`). Unidad de medida en la que se expresa la cantidad contenida.
- `is_approximate`: `boolean` (default `false`). Distingue presentaciones exactas estandarizadas de medidas humanas empíricas o aproximadas.
- `is_active`: `boolean` (default `true`). Estado de la conversión (desactivación lógica).
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Ejemplos Reales de Conversiones por Item:**
- **Harina (base = g)**: `1 costal = 25 kg` (`is_approximate = false`, Contenido: 25, Unidad: `kg` -> equivale a 25,000 g).
- **Azúcar (base = g)**: `1 costal = 50 kg` (`is_approximate = false`, Contenido: 50, Unidad: `kg` -> equivale a 50,000 g).
- **Huevo (base = piece)**: `1 caja = 360 piece` (`is_approximate = false`, Contenido: 360, Unidad: `piece`).
- **Chocolate (base = g)**: `1 barra = 10 g` (`is_approximate = false`, Contenido: 10, Unidad: `g`).
- **Harina (base = g)**: `1 taza = 120 g` (`is_approximate = false`, Contenido: 120, Unidad: `g`).
- **Masa madre hija (base = g)**: `1 tanto ≈ 155 g` (`is_approximate = true`, Contenido: 155, Unidad: `g`).

**Invariante de Compatibilidad Dimensional:**
La unidad de destino (`unit_id`) de la conversión debe pertenecer obligatoriamente a la **misma dimensión física** que la unidad base (`base_unit_id`) del item.
- *Válido:* Harina (base `g`, dimensión `mass`) -> `1 costal = 25 kg` (`kg` pertenece a `mass`).
- *Inválido:* Harina (base `g`, dimensión `mass`) -> `1 costal = 25 L` (`L` pertenece a `volume`).

**Invariante de Unicidad de Conversiones Activas por Item:**
No pueden existir dos conversiones **activas** (`is_active = true`) para el mismo item que compartan el mismo nombre contextual (`name_singular`), comparado de forma case-insensitive.
- *Válido:* Harina (`1 costal = 25 kg`) y Azúcar (`1 costal = 50 kg`) dentro del mismo negocio.
- *Válido:* Harina (`1 costal = 25 kg` desactivado `is_active = false`) y nueva Harina (`1 COSTAL = 30 kg` activo `is_active = true`).
- *Inválido:* Harina (`1 costal = 25 kg` activo) y Harina (`1 COSTAL = 30 kg` activo).

**Conversiones Aproximadas vs. Cantidades Canónicas:**
- `is_approximate = false` (default) representa empaques o conversiones físicas exactas.
- `is_approximate = true` representa medidas empíricas para captura y UX humana. Las conversiones aproximadas no reemplazan las cantidades normalizadas canónicas ni las formulaciones porcentuales de una receta.

---

## 4. Especificación de Entidades de Recetas, Formulación y Costos Directos (M1)

```
+-----------------------------------------------------------------------------------+
|                                      RECIPES                                      |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - name: text                                                                     |
|  - output_item_id: UUID (FK -> items)                                             |
|  - is_active: boolean                                                             |
+-----------------------------------------------------------------------------------+
                                          | 1
                                          |
                                          | has many
                                          v N
+-----------------------------------------------------------------------------------+
|                                  RECIPE_VERSIONS                                  |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - recipe_id: UUID (FK -> recipes)                                                |
|  - version_number: integer                                                        |
|  - status: 'draft' | 'active' | 'archived'                                        |
|  - reference_yield_quantity: numeric exact                                        |
|  - reference_yield_unit_id: UUID (FK -> units)                                    |
|  - portion_quantity: numeric exact (nullable)                                     |
|  - portion_unit_id: UUID (FK -> units, nullable)                                  |
|  - yield_description: text (nullable)                                             |
|  - change_reason: text (nullable)                                                 |
|  - effective_from: timestamptz (nullable)                                         |
+-----------------------------------------------------------------------------------+
                                          | 1
                                          |
                                          | has many
                                          v N
+-----------------------------------------------------------------------------------+
|                                   RECIPE_INPUTS                                   |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - recipe_version_id: UUID (FK -> recipe_versions)                                |
|  - item_id: UUID (FK -> items)                                                    |
|  - position: integer                                                              |
|  - quantity_mode: 'absolute' | 'percentage'                                       |
|  - quantity: numeric exact (nullable, when absolute)                              |
|  - unit_id: UUID (FK -> units, nullable, when absolute)                            |
|  - percentage: numeric exact (nullable, when percentage)                          |
|  - costing_source: 'purchased' | 'produced' (nullable)                            |
+-----------------------------------------------------------------------------------+
       ^ percentage_input_id                      ^ basis_input_id
       |                                          |
       +--------------------+---------------------+
                            |
+-----------------------------------------------------------------------------------+
|                          RECIPE_INPUT_PERCENTAGE_BASES                            |
|  - percentage_input_id: UUID (FK -> recipe_inputs)                                |
|  - basis_input_id: UUID (FK -> recipe_inputs)                                     |
+-----------------------------------------------------------------------------------+
```

---

### 4.1 `recipes`
Representa la identidad lógica, permanente e histórica de una receta o fórmula de fabricación.

**Campos conceptuales:**
- `id`: UUID (Primary Key). Identificador universal de la receta.
- `business_id`: UUID (FK a `businesses`). Negocio propietario.
- `name`: `text` (required). Nombre de la receta (ej. "Masa de Hogaza Rústica", "Mermelada de Frutos Rojos").
- `output_item_id`: UUID (FK a `items`). Item principal que esta receta produce.
- `is_active`: `boolean` (default `true`). Estado lógico de la receta en el catálogo.
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Reglas e Invariantes:**
- En el Hito M1, una receta produce exactamente **un único item de salida principal** (`output_item_id`). No se modelan coproductos ni salidas múltiples en esta etapa.
- **Resolución Determinista Receta -> Output Item en M1**: Dentro de un mismo `business`, un item producido debe tener **como máximo una identidad lógica de `recipe` responsable de producirlo**. Las variaciones históricas de su formulación deben expresarse mediante `recipe_versions` de esa misma receta, no creando múltiples recetas paralelas para el mismo output item. Esto garantiza una resolución determinista y unívoca:
  $$\text{output\_item} \longrightarrow \text{recipe} \longrightarrow \text{recipe\_version aplicable}$$
  *(Si en el futuro Costara requiere soportar formulaciones alternativas paralelas simultáneas para un mismo output item, se diseñará explícitamente en un hito posterior).*

---

### 4.2 `recipe_versions`
Representa una versión concreta, histórica y fechada de la formulación de una receta.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`). Negocio propietario.
- `recipe_id`: UUID (FK a `recipes`). Receta a la que pertenece esta versión.
- `version_number`: `integer` (required). Número correlativo de versión (1, 2, 3...).
- `status`: `text` (`draft` | `active` | `archived`). Estado del ciclo de vida de la versión.
- `reference_yield_quantity`: `numeric` exacto (> 0). Cantidad de rendimiento base de la formulación.
- `reference_yield_unit_id`: UUID (FK a `units`). Unidad física del rendimiento base.
- `portion_quantity`: `numeric` exacto (nullable, > 0). Cantidad de rendimiento que corresponde a una porción/pieza nominal.
- `portion_unit_id`: UUID (FK a `units`, nullable). Unidad física de la porción.
- `yield_description`: `text` (nullable). Descripción contextual del rendimiento (ej. "Masa húmeda antes de hornear", "Volumen tras reducción").
- `change_reason`: `text` (nullable). Justificación del cambio respecto a la versión anterior.
- `notes`: `text` (nullable). Instrucciones o notas técnicas de la formulación.
- `effective_from`: `timestamptz` (nullable). Fecha oficial a partir de la cual entró en vigencia.
- `created_by`: UUID (nullable, FK a `auth.users`). Usuario autor de la versión.
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Invariantes y Reglas:**
- `version_number` es único por `recipe_id`.
- **Unicidad de versión activa**: Solo puede existir **exactamente una versión con `status = 'active'`** por receta en un momento dado (la versión oficial vigente actualmente).
- **Resolución Temporal de `recipe_versions`**: Toda versión publicada (`active` o `archived`) debe contar con `effective_from`. Para resolver la formulación aplicable a un momento en el tiempo $T$:
  1. Se excluyen borradores (`draft`).
  2. Se consideran versiones publicadas con $\text{effective\_from} \le T$.
  3. Se selecciona la versión aplicable más reciente para esa fecha.
- **Inmutabilidad y Ciclo de Vida**: Las versiones publicadas (`active` o `archived`) representan historia y no deben modificarse destructivamente. El paso de `active` a `archived` como parte de la publicación de una nueva versión no constituye una reescritura destructiva de la fórmula histórica.
- Las versiones en estado `draft` son borradores de trabajo mutables que no afectan los cálculos oficiales de producción ni costeo hasta su publicación oficial.
- **Agnosticismo del Rendimiento**: `reference_yield_quantity` y `yield_description` modelan genéricamente el resultado base de la mezcla para cualquier industria (panadería, salsas, cosmética, jabones), sin columnas rígidas o nombres específicos de una vertical (como `wet_dough_mass`).
- **Porciones Teóricas**: Cuando `portion_quantity` está definida, el número teórico de porciones se deriva mediante la fórmula:
  $$\text{Porciones Teóricas} = \frac{\text{reference\_yield\_quantity}}{\text{portion\_quantity}} \quad (\text{normalizados a unidad base})$$
  El resultado es una **métrica calculada on-demand** que puede contener decimales (ej. 14 kg / 1.1 kg = 12.7272... porciones). Un valor no entero es conceptualmente válido y no constituye un error.

---

### 4.3 `recipe_inputs`
Representa cada insumo o ingrediente requerido por una versión concreta de receta.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `recipe_version_id`: UUID (FK a `recipe_versions`). Versión de receta a la que pertenece el insumo.
- `item_id`: UUID (FK a `items`). Item consumido como ingrediente.
- `position`: `integer` (default 0). Orden visual u operativo de visualización en la fórmula.
- `quantity_mode`: `text` (`absolute` | `percentage`). Modo de especificación de la cantidad.
- `quantity`: `numeric` exacto (nullable, > 0). Cantidad requerida cuando `quantity_mode = 'absolute'`.
- `unit_id`: UUID (FK a `units`, nullable). Unidad de medida requerida cuando `quantity_mode = 'absolute'`.
- `percentage`: `numeric` exacto (nullable, > 0). Porcentaje requerido cuando `quantity_mode = 'percentage'`.
- `costing_source`: `text` (nullable, `purchased` | `produced`). Origen del costo para items híbridos.
- `notes`: `text` (nullable). Notas específicas del insumo en la receta.
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Invariantes y Reglas:**
- Si `quantity_mode = 'absolute'`: `quantity` y `unit_id` son obligatorios. `unit_id` debe pertenecer a la misma dimensión física que la `base_unit_id` del `item_id`.
- Si `quantity_mode = 'percentage'`: `percentage` es obligatorio, y debe asociarse al menos a un insumo base en `recipe_input_percentage_bases`.
- **Desambiguación de Fuente de Costeo (`costing_source`)**:
  - Si el item es únicamente comprable (`purchasable: true`, `producible: false`), `costing_source` es implícitamente `purchased`.
  - Si el item es únicamente producible (`purchasable: false`, `producible: true`), `costing_source` es implícitamente `produced`.
  - Si el item posee capacidad dual (`purchasable: true` y `producible: true`), `costing_source` **debe declararse explícitamente** (`purchased` o `produced`). El sistema no asume ni elige automáticamente la opción más barata.

---

### 4.4 `recipe_input_percentage_bases`
Representa la relación explícita N:M entre un insumo formulado por porcentaje y los insumos que constituyen su base de cálculo dentro de la misma receta.

**Campos conceptuales:**
- `percentage_input_id`: UUID (FK a `recipe_inputs`). Insumo configurado con `quantity_mode = 'percentage'`.
- `basis_input_id`: UUID (FK a `recipe_inputs`). Insumo que forma parte de la base porcentual.

**Invariantes y Reglas:**
- `percentage_input_id` debe corresponder a un registro en `recipe_inputs` con `quantity_mode = 'percentage'`.
- `percentage_input_id` y `basis_input_id` deben pertenecer a la **misma `recipe_version_id`**.
- Un insumo no puede ser base de sí mismo (`percentage_input_id != basis_input_id`).
- **Compatibilidad Dimensional de la Base**: Todos los insumos que conforman una misma base compuesta deben poder normalizarse a una **dimensión física compatible** (ej. todos los insumos de la base pertenecen a la dimensión `mass`).
- La cantidad física resultante de aplicar el porcentaje sobre la base normalizada debe ser dimensionalmente compatible con la dimensión física del item destino.
- **Invariante de Aciclicidad en Bases Porcentuales**: Las dependencias porcentuales deben ser **estrictamente acíclicas** y deterministas. No se permiten referencias circulares directas ni indirectas (ej. Insumo A = 10% de Insumo B, e Insumo B = 20% de Insumo A es estrictamente inválido).
- Este modelo soporta genéricamente el porcentaje de panadero (*baker's percentage*), diluciones químicas o cualquier relación proporcional compuesta sin acoplarse a nombres de ingredientes específicos.

---

### 4.5 `item_cost_versions`
Almacena el historial de costos directos de adquisición para materias primas e insumos comprados a proveedores externos.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`). Negocio propietario.
- `item_id`: UUID (FK a `items`). Item comprado al que aplica el costo.
- `cost_amount`: `numeric` exacto (>= 0). Monto monetario total pagado.
- `cost_quantity`: `numeric` exacto (> 0). Cantidad de insumo adquirida por ese monto.
- `unit_id`: UUID (FK a `units`). Unidad de medida en la que se expresa `cost_quantity`.
- `effective_from`: `timestamptz` (required). Fecha y hora a partir de la cual entra en vigencia el costo.
- `notes`: `text` (nullable). Referencia de proveedor, lote de compra o factura.
- `created_at`: `timestamptz`.

**Invariantes y Reglas:**
- Aplica exclusivamente a items con capacidad de compra (`purchasable = true`).
- `cost_amount >= 0` y `cost_quantity > 0`.
- `unit_id` debe pertenecer a la misma dimensión física que la unidad base (`base_unit_id`) del item.
- **Inmutabilidad y Preservación de Historia**: Cuando un costo cambia, se inserta un nuevo registro con su fecha `effective_from`; nunca se sobrescriben registros anteriores.
- **Resolución de Costo Vigente**: El costo directo aplicable a un momento en el tiempo $T$ se obtiene seleccionando el registro más reciente con `effective_from <= T`.
- **Costo Unitario Normalizado**:
  $$\text{Costo Unitario Base} = \frac{\text{cost\_amount}}{\text{cost\_quantity} \times \text{factor\_to\_base}}$$
- **Precisión Monetaria**: Se utilizan tipos decimales exactos (`numeric`/`decimal`), prohibiendo estrictamente tipos de punto flotante (`float`/`double`).
- La moneda se asume homogénea conforme a la moneda configurada en `businesses.currency_code`.

---

## 5. Especificación Conceptual de Planificación, Producción e Inventario (M2B + M2C.0)

El hito M2 representa el puente operacional entre la formulación teórica de recetas y la realidad física del taller:

$$\text{Receta Nominal (M1)} \longrightarrow \text{Plan de Producción} \longrightarrow \text{Targets Planificados} \longrightarrow \text{Ejecución Real (Run)} \longrightarrow \text{Movimientos de Inventario}$$

```
+-----------------------------------------------------------------------------------+
|                            PRODUCTION_PLAN_TEMPLATES                              |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - name: text (ej. "Semana Regular Panara")                                       |
|  - description: text (nullable)                                                   |
|  - is_active: boolean                                                             |
+-----------------------------------------------------------------------------------+
                                          | 1
                                          | has many
                                          v N
+-----------------------------------------------------------------------------------+
|                          PRODUCTION_PLAN_TEMPLATE_ITEMS                           |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - template_id: UUID (FK -> production_plan_templates)                            |
|  - day_of_week: integer (1=Lunes .. 7=Domingo)                                    |
|  - item_id: UUID (FK -> items)                                                    |
|  - target_quantity: numeric exact (> 0)                                           |
|  - unit_id: UUID (FK -> units)                                                    |
|  - notes: text (nullable)                                                         |
+-----------------------------------------------------------------------------------+

                                          | instantiates (conceptual)
                                          v
+-----------------------------------------------------------------------------------+
|                                PRODUCTION_PLANS                                   |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - template_id: UUID (nullable, FK -> production_plan_templates)                  |
|  - name: text (ej. "Semana 38 - Septiembre 2026")                                 |
|  - start_date: date                                                               |
|  - end_date: date                                                                 |
|  - notes: text (nullable)                                                         |
+-----------------------------------------------------------------------------------+
                                          | 1
                                          | has many
                                          v N
+-----------------------------------------------------------------------------------+
|                               PRODUCTION_TARGETS                                  |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - production_plan_id: UUID (FK -> production_plans)                              |
|  - target_date: date                                                              |
|  - item_id: UUID (FK -> items)                                                    |
|  - recipe_version_id: UUID (nullable, FK -> recipe_versions) [congelada al correr]|
|  - target_quantity: numeric exact (> 0)                                           |
|  - unit_id: UUID (FK -> units)                                                    |
|  - position: integer                                                              |
|  - notes: text (nullable)                                                         |
+-----------------------------------------------------------------------------------+
                                          |
                                          | 0..N (Target Splitting / Nullable)
                                          v
+-----------------------------------------------------------------------------------+
|                                PRODUCTION_RUNS                                    |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - production_target_id: UUID (nullable, FK -> production_targets)                |
|  - recipe_version_id: UUID (FK -> recipe_versions) [congelada al crear el run]    |
|  - status: 'planned' | 'in_progress' | 'completed' | 'cancelled'                  |
|  - planned_yield_quantity: numeric exact (> 0)                                    |
|  - planned_yield_unit_id: UUID (FK -> units)                                      |
|  - actual_yield_quantity: numeric exact (nullable, >= 0)                          |
|  - actual_yield_unit_id: UUID (FK -> units, nullable)                             |
|  - scheduled_date: date                                                           |
|  - started_at: timestamptz (nullable)                                             |
|  - completed_at: timestamptz (nullable)                                           |
|  - created_by: UUID (nullable, FK -> auth.users)                                  |
|  - notes: text (nullable)                                                         |
+-----------------------------------------------------------------------------------+
                                          | 1
                                          | has many
                                          v N
+-----------------------------------------------------------------------------------+
|                             PRODUCTION_RUN_INPUTS                                 |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - production_run_id: UUID (FK -> production_runs)                                |
|  - recipe_input_id: UUID (nullable, FK -> recipe_inputs) [NULL = unplanned]       |
|  - item_id: UUID (FK -> items)                                                    |
|  - position: integer                                                              |
|  - planned_quantity: numeric exact (>= 0) [0 cuando es unplanned]                 |
|  - planned_unit_id: UUID (nullable, FK -> units)                                  |
|  - actual_quantity: numeric exact (nullable, >= 0)                                |
|  - actual_unit_id: UUID (nullable, FK -> units)                                   |
|  - notes: text (nullable)                                                         |
+-----------------------------------------------------------------------------------+
                                          |
                                          | al completarse el run (status = 'completed')
                                          v genera de forma atómica e inmutable
+-----------------------------------------------------------------------------------+
|                               INVENTORY_MOVEMENTS                                 |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - item_id: UUID (FK -> items)                                                    |
|  - movement_type: 'initial_balance' | 'purchase_receipt' | 'production_input'     |
|                   | 'production_output' | 'inventory_adjustment' | 'reversal'     |
|  - quantity_captured: numeric exact no nulo                                       |
|  - captured_unit_id: UUID (nullable, FK -> units)                                 |
|  - item_unit_conversion_id: UUID (nullable, FK -> item_unit_conversions)           |
|  - quantity_base: numeric exact no nulo (+ entrada, - salida)                     |
|  - base_unit_id: UUID (FK -> units)                                               |
|  - conversion_factor: numeric exact (> 0)                                         |
|  - is_approximate: boolean (default false)                                        |
|  - production_run_id: UUID (nullable, FK -> production_runs)                      |
|  - production_run_input_id: UUID (nullable, FK -> production_run_inputs)          |
|  - reversal_of_movement_id: UUID (nullable, FK -> inventory_movements, UNIQUE)    |
|  - movement_date: timestamptz                                                     |
|  - created_by: UUID (nullable, FK -> auth.users)                                  |
|  - notes: text (nullable)                                                         |
+-----------------------------------------------------------------------------------+
                                          ^
                                          | normaliza masa <-> volumen mediante
+-----------------------------------------------------------------------------------+
|                                 ITEM_DENSITIES                                    |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - item_id: UUID (FK -> items)                                                    |
|  - mass_unit_id: UUID (FK -> units, dimension mass)                               |
|  - volume_unit_id: UUID (FK -> units, dimension volume)                           |
|  - density_factor: numeric exact (> 0)                                            |
|  - is_approximate: boolean (default false)                                        |
|  - is_active: boolean (default true, UNIQUE por item_id activo)                    |
+-----------------------------------------------------------------------------------+
```

### 5.1 `production_plan_templates`
Representa un patrón o molde recurrente de planificación operativa (ej. "Semana regular de obrador", "Temporada navideña").

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `name`: `text` (required). Nombre descriptivo del patrón (ej. "Semana Regular Panara").
- `description`: `text` (nullable). Notas de contexto operativo.
- `is_active`: `boolean` (default `true`). Estado de activación lógica.
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Reglas e Invariantes:**
- Estructura abstracta sin fechas de calendario específicas.
- Permite estandarizar el ritmo habitual de producción evitando la captura repetitiva cada semana (ADR-024).

---

### 5.2 `production_plan_template_items`
Representa cada meta o partida individual de producción dentro de la plantilla recurrente.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `template_id`: UUID (FK a `production_plan_templates`).
- `day_of_week`: `integer` (1 = Lunes, 2 = Martes, ..., 7 = Domingo).
- `item_id`: UUID (FK a `items`). Item que se planifica obtener.
- `target_quantity`: `numeric` exacto (> 0). Cantidad objetivo habitual para ese día.
- `unit_id`: UUID (FK a `units`). Unidad física de la meta.
- `notes`: `text` (nullable).
- `created_at`: `timestamptz`.

**Invariantes:**
- `unit_id` debe pertenecer a la misma dimensión física que la `base_unit_id` del `item_id`.
- Soporta metas en masa (ej. 10 kg Natural), volumen o piezas discretas (ej. 20 Conchas, 1 Focaccia).

---

### 5.3 `production_plans`
Representa una instancia concreta, fechada e independiente de un plan de producción para un periodo determinado (ej. una semana del calendario).

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `template_id`: UUID (nullable, FK a `production_plan_templates`). Plantilla origen utilizada para inicializar el plan.
- `name`: `text` (required). Identificador legible (ej. "Semana 38 - 14 al 20 Sep 2026").
- `start_date`: `date` (required). Fecha de inicio del periodo.
- `end_date`: `date` (required). Fecha de fin del periodo (`end_date >= start_date`).
- `notes`: `text` (nullable).
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Reglas e Invariantes:**
- **Autonomía Operativa**: Al instanciarse a partir de una plantilla, copia sus metas proyectándolas sobre las fechas calendario del periodo. Una vez creado, es enteramente autónomo.
- Editar un plan concreto (agregar pedidos especiales, cancelar una partida por feriado) **NO afecta la plantilla base ni reescribe planes históricos** (ADR-024).

---

### 5.4 `production_targets`
Representa un objetivo puntual de producción dentro de un plan fechado.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `production_plan_id`: UUID (FK a `production_plans`).
- `target_date`: `date` (required). Fecha programada de entrega u horneado.
- `item_id`: UUID (FK a `items`). Item a producir.
- `recipe_version_id`: UUID (nullable, FK a `recipe_versions`). Snapshot de la versión de receta utilizada al calcular o confirmar originalmente este objetivo de producción (ADR-030).
- `target_quantity`: `numeric` exacto (> 0). Cantidad programada.
- `unit_id`: UUID (FK a `units`). Unidad de medida.
- `position`: `integer` (default 0). Orden visual de presentación dentro del plan.
- `notes`: `text` (nullable).
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Invariantes y Reglas:**
- **Cardinalidad Target -> Runs (`0..N`)**: Un target representa la meta total del plan y no equivale rígidamente a una única corrida física. Una meta puede ejecutarse mediante varias corridas de taller (Target Splitting, ej. una meta de 14 kg ejecutada en dos corridas de 7 kg, o 5 kg + 5 kg + 4 kg). Cada corrida referencia a su target mediante `production_runs.production_target_id`. No existe restricción de unicidad (`UNIQUE`) sobre `production_target_id`.
- **Producción adicional o no planeada**: Las corridas sin target asignado llevan `production_runs.production_target_id = NULL`.
- **Congelamiento estricto de intención histórica**: Una vez que existe **cualquier corrida (`production_run`) vinculada al target**, los campos que representan la intención planificada quedan estrictamente inmutables:
  - `production_plan_id`
  - `target_date`
  - `item_id`
  - `recipe_version_id`
  - `target_quantity`
  - `unit_id`
  - `notes`
  Cualquier intento de mutar estos campos tras vincular una corrida es rechazado a nivel de base de datos para garantizar la fidelidad de la comparación planificado vs. real.
- **Presentación visual editable**: El campo `position` permanece editable en todo momento para reordenamiento en la interfaz.
- **Se elimina la regla antigua**: Queda explícitamente eliminada la regla antigua que permitía modificar targets mientras la corrida no hubiera concluido.
- `target_date` debe encontrarse dentro del rango `[start_date, end_date]` del plan.
- `unit_id` debe ser dimensionalmente compatible con la unidad base del item.
- `recipe_version_id` preserva la versión utilizada al calcular o confirmar originalmente el target. Publicaciones posteriores de recetas nunca modifican ni reescriben silenciosamente esta referencia histórica. Si al iniciar una corrida la versión oficial vigente para `target_date` difiere de la congelada en el target, el sistema detecta y bloquea el inicio con `RECIPE_VERSION_CONFLICT` sin sustituciones silenciosas (ADR-030).

---

### 5.5 `derived_production_requirements` (Concepto / Proyección Calculada On-Demand)
Representa la explosión matemática consolidada de materias primas y preparaciones intermedias compartidas requeridas por los targets de un plan.

**Aclaración Fundamental de Arquitectura (ADR-025 y ADR-030):**
- **NO es una tabla persistida en la base de datos**.
- Es una **métrica proyectada calculada on-demand** por el motor de cálculo en TypeScript puro (`src/domain`, conforme a ADR-020).
- **Reproducibilidad histórica basada en snapshot**: Una vez que `production_target.recipe_version_id` ha sido fijada, las proyecciones y consultas históricas de dicho target parten de ESA versión congelada. No se vuelve a resolver dinámicamente una receta distinta para un target histórico.
- **Resolución determinista en fecha operacional**: La resolución por fecha `asOf(target_date)` sirve para determinar o contrastar la versión aplicable respecto al calendario local del negocio (`business.timezone`), pero no sustituye silenciosamente la versión histórica del target.
- *Ejemplo conceptual de derivación:*
  $$\text{20 Conchas} + \text{4 Pan de Deus} + \text{12 Trenzas} + \text{12 Roles Canela} + \text{6 Roles Philly} \longrightarrow \text{Masa Dulce proyectada para contrastar vs. 3.5 kg}$$
- Si el usuario modifica los targets de un plan antes de su ejecución, la proyección se recalcula instantáneamente, eliminando inconsistencias y registros huérfanos.

---

### 5.6 `production_runs`
Representa una corrida o lote de ejecución física real en taller para una receta aprobada.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `production_target_id`: UUID (nullable, FK a `production_targets`). Objetivo planificado del que nace la corrida (si es `NULL`, representa producción física adicional/no planeada).
- `recipe_version_id`: UUID (FK a `recipe_versions`). Versión exacta e inmutable de la receta bajo la cual se ejecuta el lote.
- `status`: `text` (`planned` | `in_progress` | `completed` | `cancelled`).
- `planned_yield_quantity`: `numeric` exacto (> 0). Cantidad de producto que se planificó obtener en este lote físico.
- `planned_yield_unit_id`: UUID (FK a `units`).
- `actual_yield_quantity`: `numeric` exacto (nullable, >= 0). Cantidad física real obtenida al concluir la corrida.
- `actual_yield_unit_id`: UUID (FK a `units`, nullable).
- `scheduled_date`: `date`. Fecha programada de ejecución en calendario operacional del negocio.
- `started_at`: `timestamptz` (nullable). Momento real de inicio del proceso físico.
- `completed_at`: `timestamptz` (nullable). Momento de finalización física.
- `created_by`: UUID (nullable, FK a `auth.users`). Usuario u operario responsable.
- `notes`: `text` (nullable).
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Invariantes y Reglas:**
- Solo puede ejecutarse contra versiones publicadas (`active` o `archived`), nunca contra borradores (`draft`).
- **Fijación inmutable de la receta (ADR-030)**: La versión de receta utilizada (`recipe_version_id`) queda congelada desde la creación de la corrida. Publicaciones posteriores de recetas nunca alteran una corrida ya creada o en curso.
- **Rendimiento real (`actual_yield_quantity >= 0`)**: Al pasar a `completed`, `actual_yield_quantity` y `actual_yield_unit_id` se vuelven obligatorios.
  - Se permite válidamente `actual_yield_quantity = 0` si hubo ejecución física real pero cero producto utilizable (ej. lote quemado, masa caída o contaminada).
  - En caso de rendimiento 0, los insumos consumidos generan sus correspondientes salidas `production_input`, pero no se genera ningún movimiento de entrada `production_output`.
- **Cancelación honesta (`cancelled`)**: El estado `cancelled` representa una corrida sin hechos físicos consumados. Queda estrictamente prohibido cancelar una corrida si ya cuenta con insumos reales capturados o movimientos de inventario asentados; la cancelación nunca puede ocultar consumos reales.
- **Frontera de privilegios y escritura (M2C.0)**:
  - Lectura (`SELECT`): Permitida a miembros autenticados del negocio vía RLS.
  - Escritura directa (`INSERT`, `UPDATE`, `DELETE`): **Revocada por completo** para el rol `authenticated`.
  - Inicio de corrida: A través de la Edge Function autoritativa `start-production-run` que delega en la función transaccional `private.start_production_run_from_snapshot`.
  - Finalización de corrida: Exclusivamente mediante la RPC transaccional `public.complete_production_run`.
  - Cancelación de corrida: Exclusivamente mediante la RPC transaccional `public.cancel_production_run`.
  - Edición de notas: Exclusivamente mediante la RPC `public.update_production_run_notes` mientras la corrida permanece `in_progress`.

---

### 5.7 `production_run_inputs`
Representa los insumos planificados y los consumos reales efectivamente pesados en la corrida de taller.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `production_run_id`: UUID (FK a `production_runs`).
- `recipe_input_id`: UUID (nullable, FK a `recipe_inputs`). Enlace a la línea nominal de receta.
- `item_id`: UUID (FK a `items`). Insumo o preparación consumida.
- `position`: `integer` (default 0).
- `planned_quantity`: `numeric` exacto (>= 0). Cantidad proyectada por el escalado autoritativo de la receta.
- `planned_unit_id`: UUID (nullable, FK a `units`).
- `actual_quantity`: `numeric` exacto (nullable, >= 0). Cantidad física real consumida.
- `actual_unit_id`: UUID (nullable, FK a `units`).
- `notes`: `text` (nullable).
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Semántica de Insumos Nominales vs. No Planeados:**
- **Línea Nominal (generada por la formulación)**:
  - `recipe_input_id IS NOT NULL`
  - `planned_quantity > 0`
  - `planned_unit_id IS NOT NULL`
  - Corresponde a una entrada formal de la `recipe_version_id` ejecutada.
  - Las líneas nominales no pueden eliminarse de la corrida.
- **Línea No Planeada / Adicional (agregada en taller)**:
  - `recipe_input_id IS NULL`
  - `planned_quantity = 0`
  - `planned_unit_id IS NULL`
  - Representa un ingrediente o aditivo extra utilizado en taller que no figuraba en la formulación nominal.
  - Se admiten múltiples líneas no planeadas del mismo `item_id`.

**Invariantes y Reglas:**
- **Eliminación de `was_altered`**: El campo booleano `was_altered` **NO existe** en la base de datos. La comparación entre lo planeado y lo real se deriva on-demand en la capa de cálculo/UI.
- **Snapshot planeado inmutable**: Las columnas de planificación (`recipe_input_id`, `planned_quantity`, `planned_unit_id`) son estructuralmente inmutables desde la creación de la corrida.
- **Edición en ejecución**: Mientras la corrida esté `in_progress`, el cliente puede actualizar `actual_quantity`, `actual_unit_id` y `notes`. Los insumos no planeados se registran o descartan mediante las RPCs `add_unplanned_production_run_input` y `remove_unplanned_production_run_input`.
- **Congelamiento terminal**: Al alcanzar un estado terminal (`completed` o `cancelled`), todos los registros de insumos quedan congelados e inmutables.

---

### 5.8 `item_densities`
Representa la relación de conversión de densidad específica (masa <-> volumen) para un item dentro del negocio.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `item_id`: UUID (FK a `items`).
- `mass_unit_id`: UUID (FK a `units`, dimensión `mass`).
- `volume_unit_id`: UUID (FK a `units`, dimensión `volume`).
- `density_factor`: `numeric` exacto (> 0). Factor que relaciona masa y volumen normalizados a sus unidades canónicas base (`g` y `ml`).
- `is_approximate`: `boolean` (default `false`). Distingue densidades calibradas de equivalencias empíricas.
- `is_active`: `boolean` (default `true`). Estado de activación lógica.
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Invariantes y Reglas:**
- `mass_unit_id` pertenece obligatoriamente a `mass` y `volume_unit_id` a `volume`.
- **Densidad operacional única activa**: Solo puede existir **como máximo una densidad activa** (`is_active = true`) por item dentro de un negocio (`UNIQUE(business_id, item_id) WHERE is_active = true`).
- Conversión interdimensional exclusiva masa <-> volumen para el item configurado (ADR-031).
- **Fallo explícito ante ausencia de densidad**: Si se captura una transacción en una dimensión incompatible con la unidad base del item y no existe una densidad activa, el sistema falla de inmediato exigiendo la configuración del factor.
- **Preservación histórica**: Todo movimiento de inventario almacena de forma inmutable el factor utilizado al momento del hecho; cambios futuros en la densidad del item aplican únicamente a hechos posteriores.

---

### 5.9 `inventory_movements`
Representa el libro diario inmutable (kardex) de movimientos de inventario físico.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `item_id`: UUID (FK a `items`).
- `movement_type`: `text` (`initial_balance` | `purchase_receipt` | `production_input` | `production_output` | `inventory_adjustment` | `reversal`).
- `quantity_captured`: `numeric` exacto no nulo. Cantidad original ingresada por el usuario.
- `captured_unit_id`: UUID (nullable, FK a `units`). Unidad en la que se ingresó la cantidad.
- `item_unit_conversion_id`: UUID (nullable, FK a `item_unit_conversions`). Presentación o empaque utilizado.
- `quantity_base`: `numeric` exacto no nulo. Cantidad normalizada a la unidad base canónica del item (+ entrada, - salida).
- `base_unit_id`: UUID (FK a `units`). Unidad base canónica del item.
- `conversion_factor`: `numeric` exacto (> 0). Factor aplicado para normalizar a la unidad base canónica.
- `is_approximate`: `boolean` (default `false`). Indica si la conversión empleada tuvo naturaleza aproximada.
- `production_run_id`: UUID (nullable, FK a `production_runs`). Enlace tipado a la corrida de producción origen.
- `production_run_input_id`: UUID (nullable, FK a `production_run_inputs`). Enlace tipado al insumo específico consumido.
- `reversal_of_movement_id`: UUID (nullable, FK a `inventory_movements`). Enlace tipado autorreferencial al movimiento que se revierte.
- `movement_date`: `timestamptz`. Fecha y hora operacional del hecho físico.
- `created_by`: UUID (nullable, FK a `auth.users`).
- `notes`: `text` (nullable).
- `created_at`: `timestamptz`.

**Invariantes y Reglas:**
- **Convención estricta de signos de `quantity_base`**:
  - `initial_balance`: Positivo (`quantity_base > 0`). Saldo inicial de existencias.
  - `purchase_receipt`: Positivo (`quantity_base > 0`). Recepción física directa de insumo comprado (ADR-029).
  - `production_output`: Positivo (`quantity_base > 0`). Entrada de producto elaborado al completar corrida física.
  - `production_input`: Negativo (`quantity_base < 0`). Salida de insumo consumido al completar corrida física.
  - `inventory_adjustment`: Positivo o negativo distinto de cero (`quantity_base != 0`). Ajuste por conteo físico o corrección.
  - `reversal`: Inverso exacto del movimiento original (`quantity_base = -original.quantity_base`).
- **Provenance Tipada sin Referencias Polimórficas (ADR-032)**:
  - Quedan eliminadas las columnas `source_entity_type` y `source_entity_id`.
  - Salidas de insumos (`production_input`): Enlazan mediante FK obligatoria a `production_run_id` y `production_run_input_id`.
  - Entradas de producción (`production_output`): Enlazan mediante FK obligatoria a `production_run_id`.
  - Hechos autónomos (`purchase_receipt`, `initial_balance`, `inventory_adjustment`): El movimiento es en sí mismo el hecho fuente; no requiere enlaces foráneos artificiales.
  - Reversiones (`reversal`): Enlazan mediante FK obligatoria a `reversal_of_movement_id`.
- **Reversiones Inmutables y Kardex Append-Only**:
  - Los movimientos son estrictamente append-only; nunca se actualizan ni eliminan destructivamente.
  - Un movimiento solo puede revertirse una única vez (`reversal_of_movement_id` cuenta con restricción `UNIQUE`).
  - Un movimiento de tipo `reversal` no puede ser revertido.
  - La reversión genera una nueva línea que invierte con exactitud matemática el impacto de `quantity_base` conservando el factor y la trazabilidad del evento original.
- **Stock Derivado (`get_current_inventory_stock`)**:
  - No existe columna persistida mutable `current_stock`.
  - Las existencias disponibles en almacén se derivan exclusivamente como $\sum \text{quantity\_base}$ sobre el historial inmutable.
  - La función de lectura incluye todos los items con `track_inventory = true`, tanto activos como inactivos. Aquellos items sin movimientos históricos se presentan en saldo cero.

---

## 6. Reglas del Dominio, Dinámica Operativa y Algoritmos Conceptuales

### 6.1 Rendimiento de Referencia y Porciones Teóricas
1. La formulación de una receta se define para un lote de referencia expresado en `reference_yield_quantity` y `reference_yield_unit_id` (ej. 14 kg de mezcla).
2. Si el producto final se divide en unidades discretas, se define `portion_quantity` y `portion_unit_id` (ej. 1.1 kg por pieza cruda).
3. Las porciones teóricas se calculan on-demand dividiendo el rendimiento entre la porción. El sistema acepta y conserva valores no enteros sin redondearlos forzosamente ni considerarlos errores.

### 6.2 Escalado de Recetas como Operación de Planificación
1. Escalar una receta consiste en proyectar las cantidades de insumos para alcanzar un objetivo de producción deseado (ej. producir 12 piezas en lugar de las 6 de referencia, o preparar 28 kg de mezcla).
2. El factor de escala se calcula como:
   $$\text{Factor de Escala} = \frac{\text{Cantidad Objetivo}}{\text{Cantidad de Referencia}}$$
3. Todas las cantidades absolutas y bases porcentuales se multiplican por el mismo factor de escala de forma proporcional.
4. **El escalado es transitorio y reproducible**: Se calcula en memoria para fines de visualización o planificación de órdenes, **sin crear nuevas versiones en `recipe_versions` ni mutar la versión canónica**.

### 6.3 Formulación Nominal vs. Realidad Operativa (Frontera con Producción)
1. `recipe_versions` representa la expectativa teórica o estándar de operación.
2. En la operación diaria, las cantidades efectivamente pesadas o consumidas y los rendimientos logrados pueden variar por múltiples factores reales.
3. En hitos posteriores (`M2 - Production`), el sistema registrará los eventos reales de producción (cantidades planificadas vs cantidades reales consumidas y rendimientos reales obtenidos). Las desviaciones se conservan como datos de aprendizaje operativo y no alteran la receta canónica (ADR-015, ADR-028).

### 6.4 Insumos Absolutos, Porcentuales y Resolución de Bases
1. **Insumo Absoluto**: Se define con cantidad física fija para el lote de referencia (ej. Harina Blanca: 10 kg).
2. **Insumo Porcentual**: Se calcula respecto a la suma de las cantidades normalizadas de sus insumos base asociados en `recipe_input_percentage_bases`.
   $$\text{Cantidad Calculada} = \left( \sum_{b \in \text{Bases}} \text{Cantidad Normalizada}(b) \right) \times \frac{\text{percentage}}{100}$$
3. **Bases Compuestas**: Un insumo porcentual puede tomar como base múltiples insumos (ej. 10% de masa madre sobre una base de 10 kg de harina blanca + 4 kg de harina integral = 1.4 kg).
4. **Aciclicidad**: Toda la red de dependencias entre insumos porcentuales debe ser acíclica y resoluble de forma determinista en una pasada topológica.

### 6.5 Conversiones Contextuales Aproximadas (`is_approximate`)
1. Las conversiones contextuales con `is_approximate = true` (ej. 1 tanto ≈ 155 g) permiten que los operarios visualicen y capturen datos en unidades empíricas familiares.
2. Si una receta calcula que se requieren 1.400 kg de masa madre, la interfaz puede informar complementariamente *"≈ 9 tantos"*, manteniendo siempre los 1.400 kg como la cantidad canónica exacta para el cálculo de costos e inventario.

### 6.6 Costeo Recursivo de Items Producidos y Recetas Anidadas
1. Los items producidos internamente obtienen su costo directo sumando el costo de todos los insumos requeridos en su receta aplicable, normalizados al rendimiento de la misma:
   $$\text{Costo Directo por Unidad Base} = \frac{\sum \text{Costo Insumo}_i}{\text{Rendimiento de Referencia Normalizado}}$$
2. Si un insumo es a su vez un item producido (ej. la receta de "Hogaza" consume el item producido "Masa Madre Hija"), el sistema resuelve recursivamente el costo del insumo a través de su propia receta aplicable.
3. No se requieren tablas especiales de recetas anidadas; la anidación surge naturalmente de la relación grafo: `Recipe A produce Item X` y `Recipe B consume Item X`.
4. **Costeo Histórico de Items Producidos para una Fecha $T$**: Al calcular el costo directo producido para una fecha $T$, Costara resuelve:
   - La `recipe_version` aplicable en $T$ (versión publicada más reciente con $\text{effective\_from} \le T$).
   - Los `item_cost_versions` aplicables en $T$ para insumos comprados ($\text{effective\_from} \le T$ más reciente).
   - Recursivamente, la `recipe_version` y los costos de insumos aplicables en $T$ para preparaciones intermedias producidas.
   - *Ejemplo conceptual:* $\text{Costo de Mermelada al 15/03/2025} = \text{formulación de Mermelada vigente al 15/03/2025} + \text{costos de inputs vigentes al 15/03/2025}$.
   - *Regla Fundamental:* Nunca usar automáticamente la receta actual con costos históricos si dicha receta no era la aplicable en esa fecha.

### 6.7 Prohibición y Detección de Ciclos
1. Las dependencias entre recetas para fines de costeo **no pueden formar ciclos directos ni indirectos**:
   - Directo: Receta A consume el mismo Item A que produce.
   - Indirecto: Receta A produce Item A y consume Item B; Receta B produce Item B y consume Item A.
2. Cualquier ciclo provocaría recursión infinita en el motor de costos. Los ciclos deben ser detectados y rechazados durante la validación y cálculo de recetas (formalizado en M1C).

### 6.8 Costos por Capas y Frontera con Costos Futuros
1. **Enfoque modular**: En M1 se implementa de forma estricta el **Costo Directo de Materiales**.
2. Capas de costo adicionales (mano de obra directa, energéticos como gas/luz, empaque, factores de merma y prorrateo de costos fijos) se integrarán en hitos posteriores.
3. La interfaz de usuario en M1 comunicará explícitamente *"Costo directo de materiales"*, evitando términos engañosos como *"Costo total"* o *"Ganancia neta"*.

### 6.9 Precios de Venta, Márgenes y Objetivos Configurables
1. El precio de venta al cliente es una variable comercial independiente del costo directo. Costara no aplica fórmulas de fijación de precio universales ni restrictivas.
2. Se contemplan objetivos de margen porcentual configurables a dos niveles:
   - **Objetivo General del Negocio**: Margen benchmark global (ej. 60%).
   - **Objetivos Específicos por Producto**: Sobreescritura para items individuales (ej. producto gancho al 25%, producto estrella al 68%).
3. Los objetivos operan como indicadores visuales de salud financiera (benchmarks), no como bloqueos operativos para vender o facturar.

### 6.10 Insumos Intermedios: Costo vs. Precio de Venta
Cuando un item producido (ej. "Mermelada de Fresa") posee un precio de venta al público y es consumido como insumo en otra preparación (ej. "Rol de Fresa"), el motor de costeo utiliza estrictamente su **costo directo producido o comprado**, **nunca su precio de venta al público**.

### 6.11 Dinámica entre Plantilla Recurrente y Plan Fechado Concreto
1. La plantilla (`production_plan_templates`) almacena metas relativas por día de la semana (`day_of_week`) sin fechas fijas de calendario.
2. Un plan fechado (`production_plans`) se inicializa copiando las metas de la plantilla mapeadas al rango de fechas calendario de la semana deseada.
3. El plan resultante es completamente autónomo: se pueden ajustar cantidades, añadir metas extraordinarias o cancelar líneas de producción para un día festivo sin alterar la plantilla reusable y sin modificar el historial de planes pasados (ADR-024).

### 6.12 Derivación On-Demand de Intermedios Compartidos (Explosión de Requerimientos)
1. Múltiples productos terminados planificados (ej. Conchas, Pan de Deus, Trenzas, Roles de Canela) consumen una misma preparación intermedia producida (ej. Masa Dulce).
2. El motor de dominio consolida bajo demanda las necesidades totales de intermedios y de materias primas recorriendo los `production_targets` del plan y resolviendo de forma determinista la `recipe_version` aplicable para la fecha programada de cada target (`asOf(target_date)` con `effective_from <= target_date`, conforme a ADR-013, ADR-020 y ADR-025).
3. **Prohibición de receta activa actual y preservación de intención**: Cada target conserva en `recipe_version_id` la versión con la que fue creado o confirmado originalmente. Queda estrictamente prohibido que consultas posteriores o publicaciones retroactivas reescriban silenciosamente la intención de planes pasados. Si surge una versión más reciente para `target_date`, el sistema detecta y visibiliza la diferencia de forma preventiva antes de la corrida física (ADR-025, ADR-030).
4. Esta consolidación se trata estrictamente como una **proyección calculada on-demand** y no se persiste prematuramente en tablas estáticas (ADR-025). Si se añade o elimina una meta de producto terminado, el requerimiento de masa intermedia se actualiza instantáneamente de forma determinista.

### 6.13 Frontera de Ejecución Autoritativa M2C.0, Snapshot Planeado y Privilegios
1. **Flujo de Ejecución y Autoridad Matemática Única (ADR-020, ADR-021)**:
   $$\text{Browser} \longrightarrow \text{Edge Function (start-production-run)} \longrightarrow \text{src/domain} \longrightarrow \text{RPC DB (private.start\_production\_run\_from\_snapshot)} \longrightarrow \text{DB}$$
   La matemática de resolución de formulación, bases porcentuales y escalado reside exclusivamente en `src/domain` como TypeScript puro. La base de datos no recalcula recetas en PL/pgSQL; su rol es validar membresía, integridad referencial, provenance, inmutabilidad de targets y garantizar inserción atómica.
2. **Frontera de la Edge Function**:
   - Autentica la identidad del usuario mediante token JWT.
   - Lee datos del catálogo y recetas bajo el contexto y permisos RLS del usuario.
   - Valida la zona horaria IANA del negocio (`business.timezone`) sin fallbacks silenciosos a UTC.
   - Ejecuta `resolveRecipeFormula`, `resolveYieldAndOutput` y `applyRecipeScaling`.
   - Normaliza todas las cantidades de insumos a la `base_unit_id` canónica del item.
   - Serializa los valores numéricos a `numeric(30,12)` como texto para cruzar la frontera de persistencia sin degradación flotante.
   - Invoca mediante rol `service_role` exclusivamente la RPC interna transaccional.
3. **Detección Preventiva de Conflicto de Receta (ADR-030)**:
   - Para corridas nacidas de un target, se contrasta la versión snapshot congelada en el target contra la versión oficial publicada aplicable a `target_date` en la zona horaria del negocio.
   - Si difieren, la Edge Function rechaza la solicitud de inmediato con error tipado `RECIPE_VERSION_CONFLICT`, prohibiendo cualquier sustitución silenciosa de receta.
4. **Ciclo de Vida y Transición de Estados**:
   - En M2C.0, la corrida física se materializa directamente en estado `in_progress`, registrando el timestamp `started_at` y congelando el snapshot planeado de insumos.
   - La transición a `completed` se realiza exclusivamente mediante la RPC `complete_production_run`. Admite válidamente `actual_yield_quantity = 0` si hubo proceso físico real con merma total (lote quemado o arruinado), generando salidas `production_input` pero ninguna entrada `production_output`.
   - La transición a `cancelled` se realiza mediante la RPC `cancel_production_run`, requiriendo ausencia de hechos físicos consumados (se rechaza si ya existen consumos reales o movimientos de inventario).
5. **Frontera de Privilegios**:
   - `INSERT`, `UPDATE` y `DELETE` directo están revocados al rol `authenticated` en `production_runs` y `production_run_inputs`.
   - Toda mutación de estado ocurre exclusivamente a través de las RPCs controladas de seguridad definer (`complete_production_run`, `cancel_production_run`, `update_production_run_notes`).

### 6.14 Captura Operativa de Consumos, Insumos No Planeados y Derivación
1. **Derivación On-Demand vs. `was_altered`**:
   - El campo booleano `was_altered` queda eliminado del modelo y de la base de datos.
   - Cualquier comparación entre cantidades planificadas y cantidades reales consumidas se **deriva on-demand** en la interfaz o capa de servicio.
2. **Insumos Nominales**:
   - Precargados a partir de la fórmula de la receta (`recipe_input_id IS NOT NULL`, `planned_quantity > 0`).
   - Las cantidades planificadas son inmutables.
   - Durante `in_progress`, el operario captura `actual_quantity`, `actual_unit_id` y `notes`.
   - Las líneas nominales no pueden eliminarse de la corrida.
3. **Insumos No Planeados (Taller)**:
   - Ingredientes adicionales no previstos en la fórmula nominal (`recipe_input_id IS NULL`, `planned_quantity = 0`).
   - Se registran y eliminan durante `in_progress` mediante las RPCs `add_unplanned_production_run_input` y `remove_unplanned_production_run_input`.
4. **Congelamiento Terminal**:
   - Al completar o cancelar la corrida, todos sus insumos quedan sellados e inmutables.

### 6.15 Preservación Honesta de Desviaciones vs. Clasificación de Merma
1. Si una corrida planificada para 3.5 kg de masa rinde físicamente 3.42 kg, el sistema registra el rendimiento real y conserva la diferencia operacional (80 g) sin alterar la receta oficial (ADR-015, ADR-028).
2. Costara **prohíbe clasificar automáticamente las desviaciones de rendimiento como merma o desperdicio en M2**. Una variación puede originarse por evaporación, humedad ambiental, tolerancias de báscula o retención normal en equipos. La categorización y costeo formal de mermas corresponde al hito M3.

### 6.16 Movimientos de Inventario, Provenance Tipada y Reversiones Append-Only
1. Ni los planes de producción ni las corridas en estado `in_progress` generan movimientos de inventario. El plan representa una expectativa futura y no altera las existencias físicas.
2. Los movimientos de inventario (`inventory_movements`) se originan **exclusivamente a partir de hechos operacionales concluidos y confirmados**. Un `production_run` finalizado en estado `completed` es **una fuente operacional legítima** que asienta atómicamente:
   - Salidas (`production_input`): Una línea de salida por cada insumo consumido en `production_run_inputs`.
   - Entrada (`production_output`): Una línea de entrada por el producto intermedio o terminado obtenido (`actual_yield_quantity`), omitiéndose si el rendimiento real fue cero.
3. **Provenance Tipada sin Polimorfismo (ADR-032)**:
   - Enlaces foráneos explícitos y tipados a `production_run_id` y `production_run_input_id`.
   - Hechos autónomos (`purchase_receipt`, `initial_balance`, `inventory_adjustment`) operan como hechos fuente directos sin claves foráneas externas artificiales.
4. **Reversiones Inmutables (Reversals)**:
   - Cualquier anulación o corrección de un movimiento se registra mediante un movimiento append-only de tipo `reversal`.
   - El movimiento de reversión invierte con exactitud el valor de `quantity_base`, referenciando al original mediante `reversal_of_movement_id`.
   - Restricción estricta de unicidad: un movimiento solo puede revertirse una vez, y un movimiento `reversal` no puede ser revertido.
5. **Stock Derivado (`get_current_inventory_stock`)**:
   - Las existencias disponibles no se persisten en columnas mutables; se calculan on-demand mediante $\sum \text{quantity\_base}$ sobre el Kardex inmutable para todos los items con `track_inventory = true`.
6. **Conversiones Interdimensionales de Densidad y Preservación Histórica (ADR-031)**:
   - La conversión entre masa y volumen requiere una configuración activa en `item_densities`.
   - Cada movimiento de inventario almacena de forma inmutable el factor aplicado al momento del registro. Un ajuste posterior en la densidad del item nunca recalcula movimientos históricos del Kardex.

---

## 7. Validación Conceptual con Casos Reales (Panara)

### 7.1 Validación Conceptual de Formulación y Recetas (M1)
Los siguientes ejemplos ilustran la flexibilidad del modelo agnóstico aplicado al caso de panadería sin incorporar nombres de dominio en el esquema:
- **Agua pesada en báscula**: El item "Agua" tiene `base_unit_id = gram` (dimensión `mass`), reflejando que en la práctica se pesa en lugar de medir por volumen.
- **Masa madre base vs. Masa madre hija**: Se modelan como dos items distintos. "Masa madre hija" es el `output_item_id` de una receta de refresco y el insumo de la receta de "Hogaza".
- **Conversión aproximada de tanto**: "Masa madre hija" tiene la conversión `1 tanto ≈ 155 g` con `is_approximate = true`.
- **Porcentaje de Panadero**: En la receta de Hogaza, la harina blanca (10 kg) y la harina integral (4 kg) son insumos absolutos que forman la base porcentual compuesta (14 kg total). La masa madre se formula como `percentage = 10%`, resultando en 1.400 kg.
- **Rendimiento y porciones**: Rendimiento base de 14 kg de masa con porción de 1.1 kg produce 12.7272... porciones teóricas.
- **Escalado**: Para producir 20 porciones, Costara calcula el factor de escala proporcional y ajusta los insumos sin modificar la versión canónica de la receta.

### 7.2 Golden Case M2-001: Jornada Regular de Producción en Panara (Lunes)
- **Planificación diaria heterogénea**: Mezcla metas en masa (10 kg Natural, 14.5 kg Granos, 3.5 kg Masa Dulce) y metas en piezas discretas (1 Focaccia, 1 Panqué de plátano).
- **Surtido dulce planificado**: 20 Conchas, 4 Pan de Deus, 12 Trenzas, 12 Roles Canela y 6 Roles Philadelphia.
- **Evidencia operacional real vs. Estado de derivación**: En Panara se preparan habitualmente 3.5 kg de Masa Dulce para este surtido (3 kg los viernes). Actualmente solo Pan de Deus cuenta con gramaje por pieza confirmado (70 g nominales); para los demás productos no se asumen gramajes inventados. En M2, 3.5 kg representa un **objetivo operacional real observado** que se programa directamente. Cuando todas las recetas cuenten con consumos estructurados, Costara derivará la proyección matemática para compararla contra ese objetivo de taller.
- **Flujo físico y kardex**:
  - Amasado de Masa Dulce: corrida escalada a 3.5 kg rinde 3.42 kg reales (80 g de variación conservada honestamente).
  - Al completar la corrida de Masa Dulce en estado `completed`: salidas de harina, huevo, azúcar, mantequilla; entrada de 3.42 kg de Masa Dulce.
  - Al formar y hornear Conchas y Pan de Deus: corridas secundarias consumen Masa Dulce (salida de intermedio) e ingresan piezas de pan terminado (entrada de producto terminado).

### 7.3 Golden Case M2-002: Pan de Deus con Masa Dulce Intermedia y Resolución Candidata de OPEN-001
- **Target**: 4 piezas de Pan de Deus.
- **Receta nominal**: 4 piezas requieren 280 g de Masa Dulce (70 g por pieza derivable: $280\text{ g} / 4\text{ piezas} = 70\text{ g/pieza}$) y 140 g de Crema de Limón (35 g por pieza).
- **Ejecución real**: En formado se consumen 284 g de Masa Dulce. La corrida concluye registrando 4 piezas obtenidas y 284 g de masa consumida. La diferencia de 4 g se registra fielmente sin mutar la receta canónica (280 g nominales) y sin asumir merma.

### 7.4 Golden Case M2-003: Plan Semanal Recurrente (Plantilla Viva vs. Plan Fechado Concreto)
- **Plantilla (`ProductionPlanTemplate`)**: Modela el ritmo de lunes a sábado de Panara.
- **Instancia concreta (`ProductionPlan`)**: Genera el plan fechado para una semana específica en el calendario a partir de la plantilla semanal.
- **Autonomía**: Si en una semana determinada el negocio requiere ajustar las cantidades de un día o añadir un pedido extraordinario `[EJEMPLO ILUSTRATIVO HIPOTÉTICO - NO DATO REAL DE PANARA]`, los cambios se aplican exclusivamente sobre los `production_targets` de esa semana. La plantilla semanal base permanece intacta y los planes de semanas pasadas no se modifican.

---

## 8. Principios Transversales del Modelo

### 8.1 Aislamiento Multi-Tenant Estricto
Toda entidad operativa contiene `business_id` obligatorio para garantizar el aislamiento de datos entre empresas clientes mediante Row Level Security (RLS).

### 8.2 Inmutabilidad de Hechos y Versiones Publicadas
Las versiones activas de recetas, los registros históricos de costos de insumos, las corridas de producción completadas y los movimientos de inventario nunca se sobrescriben. Los cambios generan nuevas versiones, nuevos registros de vigencia o movimientos de ajuste.

### 8.3 Precisión Monetaria y Numérica sin Floating Point
Todas las cantidades, rendimientos, porcentajes y valores monetarios se almacenan como tipos decimales exactos (`numeric`/`decimal`), eliminando errores de redondeo de punto flotante.

### 8.4 Separación entre Datos Fuente y Métricas Derivadas
Las porciones teóricas, los factores de escalado, los requerimientos consolidados de producción, los costos producidos recursivos y los márgenes son métricas derivadas calculadas on-demand a partir de hechos fuente inmutables.

### 8.5 Independencia entre Expectativa Planificada, Hecho Físico y Movimiento Contable
La receta es la expectativa nominal (M1); el plan es la intención programada (M2); el run es el hecho físico ejecutado (M2); y el movimiento de inventario es el asiento inmutable resultante (M2). Ninguna de estas capas sobrescribe ni reemplaza a las demás.

---

## 9. Escenarios de Aceptación (Acceptance Scenarios)

### Escenarios Fundamentales de M0 (1 - 10)

1. **Conversión Universal Estándar:**
   `1 kg` equivale exactamente a `1,000 g`.

2. **Conversión Universal Decimal:**
   `2.5 kg` equivalen exactamente a `2,500 g`.

3. **Resolución de Alias Global:**
   El texto `"KGS"` (ingresado en mayúsculas) se resuelve case-insensitivamente como la unidad universal `kg`.

4. **Definición de Conversión Específica por Item:**
   Un item "Harina" con unidad base `g` (dimensión `mass`) puede definir la presentación `1 costal = 25 kg`.

5. **Cálculo de Equivalencia a Unidad Base:**
   `2 costales` de la harina anterior equivalen a `50,000 g`.

6. **Conversión de Contenedor Discreto:**
   Un item "Huevo" con unidad base `piece` (dimensión `count`) puede definir `1 caja = 360 piece`.

7. **Conversión de Pieza a Masa:**
   Un item "Chocolate" con unidad base `g` (dimensión `mass`) puede definir `1 barra = 10 g`.

8. **Rechazo por Incompatibilidad Dimensional:**
   Un item "Harina" con unidad base `g` (dimensión `mass`) NO puede definir `1 costal = 25 l`, debido a que `l` pertenece a la dimensión `volume`.

9. **Aislamiento de Datos por Tenant:**
   Los items del negocio A (`business_id = A`) no son accesibles ni visibles para usuarios pertenecientes exclusivamente al negocio B (`business_id = B`).

10. **Independencia Contextual del Mismo Nombre de Presentación:**
    El mismo nombre de presentación ("costal") representa cantidades distintas según el item:
    - Item "Harina": `1 costal = 25 kg` (25,000 g).
    - Item "Azúcar": `1 costal = 50 kg` (50,000 g).

### Escenarios de Formulación, Recetas y Costos Directos de M1 (11 - 28)
11. **Múltiples Versiones y Única Versión Activa:**
    Una receta "Hogaza Rústica" posee versiones históricas v1 (archived), v2 (archived) y v3 (active). El sistema no permite tener v2 y v3 activas simultáneamente.

12. **Escalado sin Creación de Versiones:**
    Escalar una receta de 6 piezas base a 12 o 17 piezas calcula las cantidades proporcionales de insumos bajo demanda sin crear un registro en `recipe_versions`.

13. **Cálculo de Porciones Teóricas Decimales:**
    Una versión de receta con `reference_yield_quantity = 14 kg` y `portion_quantity = 1.1 kg` genera $14 / 1.1 = 12.7272...$ porciones teóricas.

14. **Validez de Porciones Teóricas No Enteras:**
    El sistema acepta y maneja el resultado de 12.7272... porciones teóricas como un valor decimal exacto y válido sin forzar redondeo ni emitir errores.

15. **Insumo Líquido Medido en Masa:**
    El item "Agua" con unidad base `g` (dimensión `mass`) se consume válidamente en kilogramos en una receta sin violaciones dimensionales.

16. **Cálculo de Insumo Porcentual Simple:**
    Un insumo "Masa madre hija" configurado con `percentage = 10%` sobre un insumo base de 14 kg de harina calcula exactamente 1.400 kg.

17. **Base Porcentual Compuesta por Múltiples Insumos:**
    Un insumo porcentual vinculado mediante `recipe_input_percentage_bases` a "Harina Blanca" (10 kg) y "Harina Integral" (4 kg) toma como base total 14 kg y calcula su porcentaje sobre esa suma.

18. **Identificación de Conversión Aproximada:**
    La presentación `1 tanto ≈ 155 g` para el item "Masa madre hija" tiene configurado `is_approximate = true`, mientras que `1 costal = 25 kg` para harina tiene `is_approximate = false`.

19. **Visualización Humana sin Pérdida de Exactitud Canónica:**
    Una fórmula calcula 1.400 kg de masa madre. La interfaz puede mostrar al operador "1.400 kg (≈ 9 tantos)" manteniendo 1.400 kg como la cantidad exacta para costeo.

20. **Consumo de Item Producido en Otra Receta (Receta Anidada):**
    El item "Masa madre hija" producido por la Receta A se utiliza como insumo en la Receta B ("Hogaza"). El costo de la Receta B incorpora el costo derivado de la Receta A.

21. **Uso de Costo y No Precio de Venta para Insumos Intermedios:**
    El item "Mermelada de Fresa" tiene un precio de venta de $180/kg y un costo producido de $75/kg. Al ser consumido como insumo en "Rol de Fresa", se costea a $75/kg.

22. **Desambiguación Explícita para Items Híbridos:**
    Un item con `purchasable: true` y `producible: true` consumido en una receta exige definir explícitamente `costing_source = 'purchased'` o `'produced'`.

23. **Selección de Costo Histórico Vigente por Fecha:**
    La harina tiene costos registrados de $20/kg (2026-01-01) y $23/kg (2026-03-15). Un cálculo con fecha 2026-02-01 selecciona $20/kg, mientras que al 2026-04-01 selecciona $23/kg.

24. **Inmutabilidad del Histórico de Costos:**
    Registrar un nuevo costo de harina de $26/kg a partir de 2026-08-01 no modifica ni sobrescribe los registros históricos de $20/kg y $23/kg.

25. **Rechazo de Ciclos en Dependencias de Recetas:**
    Una configuración donde la Receta A produce el Item A consumiendo el Item B, y la Receta B produce el Item B consumiendo el Item A, es identificada y rechazada como un ciclo circular inválido.

26. **Rechazo de Ciclos en Bases Porcentuales:**
    Una configuración donde el Insumo A está formulado como 10% del Insumo B, y el Insumo B está formulado como 20% del Insumo A, se rechaza como una dependencia porcentual circular no determinista.

27. **Preservación de Desviaciones entre Expectativa y Realidad:**
    Una receta con formulación teórica de 1.400 kg de masa madre cuya producción real registra 1.415 kg no altera la versión canónica de la receta, conservando la variación para análisis.

28. **Costo Directo Transparente y Objetivos de Margen Diferenciados:**
    El sistema calcula el "Costo directo de materiales" de una Concha ($4.50) y evalúa su margen respecto a su target específico (68%), independientemente del target general del negocio (60%).

29. **Resolución de Costo Histórico de Item Producido (Historical produced cost resolution):**
    Un item producido ("Mermelada") cambia de versión de receta entre enero (v1: 60% fruta, 40% azúcar) y julio (v2: 70% fruta, 30% azúcar). Un cálculo de costo con fecha de marzo utiliza la versión v1 de enero junto con los costos de insumos vigentes en marzo; un cálculo con fecha de agosto utiliza la versión v2 de julio con los costos de insumos vigentes en agosto.

### Escenarios de Planificación, Producción e Inventario de M2 (30 - 49)

30. **Definición de Plantilla Semanal Recurrente:**
    Un negocio crea la plantilla "Semana Regular Panara" con metas asignadas a los días 1 (Lunes) a 6 (Sábado). Las metas no contienen fechas de calendario y se almacenan como patrón reusable.

31. **Instanciación Autónoma de Plan Fechado:**
    El usuario crea el plan "Semana 38" para el periodo 2026-09-14 a 2026-09-20 seleccionando la plantilla "Semana Regular". El sistema copia las metas proyectando las fechas exactas de lunes a domingo.

32. **Modificación Puntual sin Mutar Plantilla ni Historia:**
    En el plan fechado "Semana 38", el usuario ajusta las cantidades de una meta diaria o agrega una meta extraordinaria [EJEMPLO ILUSTRATIVO HIPOTÉTICO]. La plantilla base "Semana Regular Panara" permanece intacta y los planes de semanas pasadas no se modifican.

33. **Targets con Unidades Heterogéneas en el Mismo Plan:**
    El plan consolida válidamente metas expresadas en masa (`10 kg` Natural, `base_unit: g`), piezas discretas (`20 piece` Concha, `base_unit: piece`) y unidades compuestas (`1 piece` Panqué de plátano).

34. **Derivación On-Demand y Reproducibilidad Histórica de Requerimientos (ADR-025, ADR-030):**
    Un plan incluye 20 Conchas, 4 Pan de Deus, 12 Trenzas, 12 Roles Canela y 6 Roles Philadelphia junto con un objetivo de taller de 3.5 kg de Masa Dulce. El motor consolida los requerimientos de intermedios a partir de los `recipe_version_id` congelados en los targets del plan. Si una nueva versión de Concha se publica posteriormente, la proyección histórica de este plan no se muta silenciosamente, preservando la intención con la que fue creado.

35. **Derivación de Cantidad por Pieza a partir de Receta Final (Hipótesis OPEN-001):**
    La receta de Pan de Deus declara un rendimiento de 4 piezas y un consumo de 280 g de Masa Dulce. El sistema calcula que cada pieza requiere nominalmente $280\text{ g} / 4 = 70\text{ g}$ de masa cruda sin requerir atributos específicos de panadería en el esquema.

36. **Planificación sin Impacto en Inventario:**
    La creación o edición de un plan fechado con 25 targets no genera ningún registro en `inventory_movements` ni modifica las existencias físicas disponibles de insumos.

37. **Inicio Autoritativo de Corrida Directamente en In-Progress:**
    Una corrida para 3.5 kg de Masa Dulce se inicia en taller invocando la Edge Function `start-production-run`. El sistema resuelve la formulación mediante `src/domain`, genera el snapshot inmutable de insumos y materializa directamente el `production_run` en estado `in_progress` con su timestamp `started_at`, sin asumir la existencia de un estado previo persistido `planned`.

38. **Confirmación Rápida de Consumos Nominales ("¿Cantidades planeadas? Sí"):**
    Al terminar una corrida de 10 kg de Natural, el operario confirma que se usaron las cantidades planeadas; el sistema valida y asienta `actual_quantity = planned_quantity` y `actual_unit_id = planned_unit_id` para todos los insumos nominales (`recipe_input_id IS NOT NULL`), derivando la coincidencia en la interfaz sin depender de una columna `was_altered`.

39. **Captura de Variación de Insumos y Adición No Planeada:**
    En un lote de Masa Dulce, el operario pesó 2.050 kg de harina en vez de los 2.000 kg planeados, y además añadió 50 g de agua extra para ajustar la masa. El sistema asienta 2.050 kg en el insumo nominal correspondiente y registra una línea no planeada (`recipe_input_id = NULL`, `planned_quantity = 0`, `actual_quantity = 0.050 kg`), derivando las desviaciones on-demand y manteniendo la receta oficial intacta.

40. **Preservación Honesta de Desviación de Rendimiento sin Merma Automática:**
    Una corrida planeada para 3.5 kg de Masa Dulce concluye con un rendimiento real de 3.42 kg. El sistema fija `actual_yield_quantity = 3.42 kg`, registra la variación operacional de 80 g y prohíbe clasificarla automáticamente como merma contable o descarte.

41. **Generación Atómica de Movimientos de Inventario y Rendimiento Cero (Merma Total):**
    Al completar una corrida de Masa Dulce con rendimiento real obtenido de 3.42 kg, el sistema genera atómicamente salidas `production_input` para harina, azúcar, huevos y mantequilla, y una entrada `production_output` por 3.42 kg. Si en un lote alternativo la masa se quema por completo en el horno y concluye con `actual_yield_quantity = 0`, el sistema asienta las salidas `production_input` de los insumos consumidos pero omite legítimamente la generación de movimientos `production_output`.

42. **Inmutabilidad de Corridas Completadas y Corrección Mediante Reversal Append-Only:**
    Una corrida en estado `completed` no permite modificar destructivamente sus rendimientos ni consumos reales. Cualquier anulación o corrección de los movimientos de inventario generados debe realizarse mediante un movimiento de reversión append-only (`reversal`) con enlace tipado `reversal_of_movement_id`, o mediante un movimiento compensatorio de ajuste (`inventory_adjustment`), garantizando la trazabilidad histórica total del Kardex.

43. **Recepción Mínima de Inventario Comprado en Taller (ADR-029):**
    Al llegar 2 costales de 25 kg de Harina de Fuerza al obrador, el usuario registra una recepción de inventario (item: Harina de Fuerza, cantidad: 50 kg). El sistema genera un movimiento de entrada `purchase_receipt` en `inventory_movements`, aumentando las existencias disponibles sin requerir órdenes de compra ni proveedores formales.

44. **Detección Preventiva de Conflicto de Versión en Fecha Operacional (ADR-030):**
    El domingo se crea un target de 20 Conchas para el miércoles con snapshot de `Concha v1`. El lunes se publica `Concha v2` con vigencia desde el martes en la zona horaria del negocio (`America/Mexico_City`). Al intentar iniciar la corrida el miércoles, la Edge Function contrasta la versión congelada (`v1`) contra la vigente para `target_date` (`v2`), detecta la discrepancia y rechaza el inicio con error tipado `RECIPE_VERSION_CONFLICT` sin sustitución silenciosa de receta.

45. **Recepción y Consumo Interdimensional con Densidad Específica (ADR-031):**
    El item "Leche entera" tiene unidad base `g` y densidad activa de $1\text{ ml} = 1.03\text{ g}$. Al recibir 2 Litros de leche, el sistema normaliza de forma determinista la entrada a 2060 g en `inventory_movements`. Al consumir 1850 g en una corrida de producción, el kardex registra la salida de 1850 g, resultando en un saldo determinista y reproducible de 210 g. Si posteriormente se modifica la densidad en `item_densities`, los 2060 g históricos del movimiento no se recalculan.

46. **División de Target en Múltiples Corridas Físicas (Target Splitting):**
    Un target programado para 14 kg de Masa Natural se ejecuta en taller mediante dos lotes físicos separados debido a la capacidad de la amasadora: corrida 1 por 7 kg y corrida 2 por 7 kg. Ambas corridas referencian al mismo `production_target_id`. El target congela de forma inmutable sus parámetros de intención en cuanto se inicia la primera corrida, preservando la trazabilidad de que ambas ejecuciones físicas satisfacen la misma meta del plan.

47. **Insumos Adicionales No Planeados en Taller:**
    Durante una corrida de Pan de Caja en taller, la humedad ambiental exige añadir 30 g de harina adicional y 5 g de levadura no previstos en la fórmula nominal. El sistema registra estas partidas en `production_run_inputs` con `recipe_input_id = NULL`, `planned_quantity = 0`, y sus consumos reales validados. Al completar la corrida, ambas partidas generan sus movimientos de salida `production_input` en el Kardex con trazabilidad tipada.

48. **Derivación de Existencias Reales mediante Kardex (`get_current_inventory_stock`):**
    El sistema consulta el stock físico de insumos invocando `get_current_inventory_stock`. La función calcula la suma agregada de `quantity_base` sobre los movimientos confirmados del Kardex, incluyendo items activos e inactivos con `track_inventory = true`, presentando en cero los items sin movimientos y sin mantener un campo mutable `current_stock` en la tabla `items`.

49. **Reversión Atómica e Inmutable de Movimiento de Inventario:**
    Se detecta una captura errónea en una recepción de compra (`purchase_receipt`) por 100 kg de azúcar. El sistema genera un movimiento de reversión (`reversal`) con `quantity_base = -100 kg` vinculado mediante `reversal_of_movement_id`. El movimiento original permanece inalterado en el Kardex, el saldo neto regresa a su valor previo, la restricción de unicidad impide revertir el movimiento original por segunda vez y el sistema prohíbe crear reversiones de una reversión.
