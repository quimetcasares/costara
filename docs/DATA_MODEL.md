# Modelo de Datos y Principios del Dominio - Costara (M0, M1 & M2A)

Este documento define el modelo conceptual de dominio para Costara, sus entidades fundamentales, relaciones, invariantes, reglas de cálculo y escenarios de aceptación. En esta etapa (M2A), el modelo abarca desde la fundación (M0), formulación de recetas y costos directos (M1), hasta la planificación de producción, ejecución física en taller y movimientos inmutables de inventario (M2A). Se define a nivel puramente conceptual y documental sin código SQL de implementación ni migraciones.

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
- Registro y ciclo de vida de corridas de producción física (`planned` -> `in_progress` -> `completed`).
- Captura de consumos reales con mínima fricción mediante confirmación por excepción.
- Preservación honesta de desviaciones de taller sin mutación de recetas ni clasificación automática de merma.
- Kardex de movimientos de inventario inmutables generados exclusivamente por eventos concluidos.

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
- `unit_aliases` (personalizados, donde `business_id` está definido): Aliases locales del negocio.
- `recipes`: Identidad lógica y permanente de una receta vinculada a un item de salida.
- `recipe_versions`: Versiones históricas de formulación (`draft`, `active`, `archived`).
- `recipe_inputs`: Insumos requeridos por una versión de receta (modo absoluto o porcentual).
- `recipe_input_percentage_bases`: Relación asociativa explícita de insumos que componen una base porcentual.
- `item_cost_versions`: Historial de costos directos de adquisición para insumos comprados.
- `production_plan_templates`: Patrón recurrente de planificación semanal o periódica.
- `production_plan_template_items`: Metas de producción relativas por día dentro de la plantilla.
- `production_plans`: Instancia concreta y fechada de un plan de producción.
- `production_targets`: Objetivos específicos de producción (item, cantidad, unidad, fecha) del plan.
- `production_runs`: Ejecución física de un lote vinculado a una versión aprobada de receta.
- `production_run_inputs`: Insumos planificados vs consumidos en la corrida de taller.
- `inventory_movements`: Registro inmutable tipo Kardex de entradas y salidas de stock.


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

## 5. Especificación Conceptual de Planificación, Producción e Inventario (M2A)

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
|  - target_quantity: numeric exact (> 0)                                           |
|  - unit_id: UUID (FK -> units)                                                    |
|  - notes: text (nullable)                                                         |
+-----------------------------------------------------------------------------------+
                                          |
                                          | (Targets + RecipeVersions activas)
                                          v [PROYECCIÓN DERIVADA ON-DEMAND]
               [ Requerimientos Consolidados de Intermedios e Insumos ]
                                          |
                                          | guía la programación de
                                          v
+-----------------------------------------------------------------------------------+
|                                PRODUCTION_RUNS                                    |
|  - id: UUID (PK)                                                                  |
|  - business_id: UUID (FK -> businesses)                                           |
|  - recipe_version_id: UUID (FK -> recipe_versions)                                |
|  - status: 'planned' | 'in_progress' | 'completed' | 'cancelled'                  |
|  - planned_yield_quantity: numeric exact (> 0)                                    |
|  - planned_yield_unit_id: UUID (FK -> units)                                      |
|  - actual_yield_quantity: numeric exact (nullable, > 0)                           |
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
|  - item_id: UUID (FK -> items)                                                    |
|  - planned_quantity: numeric exact (> 0)                                          |
|  - actual_quantity: numeric exact (nullable, >= 0)                                |
|  - unit_id: UUID (FK -> units)                                                    |
|  - was_altered: boolean (default false)                                           |
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
|  - movement_type: 'production_input' | 'production_output' | 'purchase_receipt'     |
|                   | 'inventory_adjustment'                                        |
|  - quantity: numeric exact (positivo entrada, negativo salida)                    |
|  - unit_id: UUID (FK -> units)                                                    |
|  - source_entity_type: text (ej. 'production_run')                                |
|  - source_entity_id: UUID (FK polimórfica conceptual al run)                      |
|  - movement_date: timestamptz                                                     |
|  - created_at: timestamptz                                                        |
|  - notes: text (nullable)                                                         |
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
- `notes`: `text` (nullable).
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Invariantes:**
- `target_date` debe encontrarse dentro del rango `[start_date, end_date]` del plan.
- `unit_id` debe ser dimensionalmente compatible con la unidad base del item.
- `recipe_version_id` preserva la versión utilizada al calcular o confirmar originalmente el target. Publicaciones posteriores de recetas nunca modifican ni reescriben silenciosamente esta referencia histórica. Si antes de ejecutar existe una versión más nueva vigente para `target_date`, Costara detecta y hace visible la diferencia de forma preventiva antes de la corrida física (ADR-030).
- Los targets pueden modificarse mientras la corrida real correspondiente no haya concluido.

---

### 5.5 `derived_production_requirements` (Concepto / Proyección Calculada On-Demand)
Representa la explosión matemática consolidada de materias primas y preparaciones intermedias compartidas requeridas por los targets de un plan.

**Aclaración Fundamental de Arquitectura (ADR-025):**
- **NO es una tabla persistida en la base de datos**.
- Es una **métrica proyectada calculada on-demand** por el motor de cálculo a partir de los `production_targets` del plan y las `recipe_versions` determinadas de forma determinista para la fecha programada de producción (`asOf(target_date)` con `effective_from <= target_date`, conforme a ADR-013, ADR-020 y ADR-025).
- **Prohibición de "receta activa actual"**: Queda estrictamente prohibido que la proyección consulte la receta activa al momento de la visualización, ya que cambios futuros de formulación alterarían retroactivamente los requerimientos de planes pasados (violando la reproducibilidad histórica).
- *Ejemplo conceptual de derivación (cuando se confirmen los gramajes de todo el surtido):*
  $$\text{20 Conchas} + \text{4 Pan de Deus} + \text{12 Trenzas} + \text{12 Roles Canela} + \text{6 Roles Philly} \longrightarrow \text{Masa Dulce proyectada para contrastar vs. 3.5 kg}$$
- Si el usuario modifica los targets del plan, la proyección se recalcula instantáneamente, eliminando inconsistencias y registros huérfanos.

---

### 5.6 `production_runs`
Representa una corrida o lote de ejecución física real en taller para una receta aprobada.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `recipe_version_id`: UUID (FK a `recipe_versions`). Versión exacta e inmutable de la receta bajo la cual se ejecuta el lote.
- `status`: `text` (`planned` | `in_progress` | `completed` | `cancelled`).
- `planned_yield_quantity`: `numeric` exacto (> 0). Cantidad de producto que se planificó obtener.
- `planned_yield_unit_id`: UUID (FK a `units`).
- `actual_yield_quantity`: `numeric` exacto (nullable, > 0). Cantidad física real obtenida al concluir la corrida.
- `actual_yield_unit_id`: UUID (FK a `units`, nullable).
- `scheduled_date`: `date`. Fecha programada de ejecución.
- `started_at`: `timestamptz` (nullable). Momento real de inicio del proceso físico.
- `completed_at`: `timestamptz` (nullable). Momento de finalización física.
- `created_by`: UUID (nullable, FK a `auth.users`). Usuario u operario responsable.
- `notes`: `text` (nullable).
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Invariantes y Reglas:**
- Solo puede ejecutarse contra versiones publicadas (`active` o `archived`), nunca contra borradores (`draft`).
- **Fijación inmutable de la receta (ADR-030)**: La versión de receta utilizada (`recipe_version_id`) queda determinada y congelada desde el instante en que la corrida física se materializa o inicia (`planned` o `in_progress`). Una publicación posterior de receta mientras el lote está en proceso nunca altera la versión fijada en esta corrida.
- **Inmutabilidad de hechos ejecutados**: Al transicionar a `completed`, `actual_yield_quantity` y `actual_yield_unit_id` se vuelven obligatorios. Los resultados obtenidos, consumos reales validados y movimientos derivados de inventario quedan sellados de forma inmutable (ADR-026, ADR-030).
- **Preservación de diferencias operacionales**: Las discrepancias entre lo planeado y lo real se registran con honestidad sin alterar la receta y sin inferir automáticamente merma contable (ADR-028).

---

### 5.7 `production_run_inputs`
Representa los insumos planificados y los consumos reales efectivamente pesados en la corrida.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `production_run_id`: UUID (FK a `production_runs`).
- `item_id`: UUID (FK a `items`). Insumo o preparación consumida.
- `planned_quantity`: `numeric` exacto (> 0). Cantidad proyectada por escalado proporcional de la receta.
- `actual_quantity`: `numeric` exacto (nullable, >= 0). Cantidad física real consumida.
- `unit_id`: UUID (FK a `units`).
- `was_altered`: `boolean` (default `false`). Indica si la cantidad real difirió de la planificada.
- `notes`: `text` (nullable).
- `created_at`: `timestamptz`.

**Dinámica de Baja Fricción:**
- Las cantidades planificadas se precargan automáticamente.
- Al concluir la corrida, el operario confirma rápidamente: "¿Usaste las cantidades planeadas? Sí / Hubo cambios". Si confirma Sí, se fijan las cantidades planificadas como consumos reales validados. Si hubo cambios, únicamente se capturan los insumos que variaron marcando `was_altered = true` (ADR-026).

---

### 5.8 `inventory_movements`
Representa el libro de movimientos inmutables (kardex) de inventario físico.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`).
- `item_id`: UUID (FK a `items`). Item cuyo stock físico se modifica.
- `movement_type`: `text` (`production_input` | `production_output` | `purchase_receipt` | `initial_balance` | `inventory_adjustment`).
- `quantity`: `numeric` exacto no nulo. Cantidad desplazada (positiva para entradas, negativa para salidas).
- `unit_id`: UUID (FK a `units`).
- `source_entity_type`: `text` (ej. `'production_run'`). Tipo de evento operacional de origen.
- `source_entity_id`: UUID. Identificador del hecho origen.
- `movement_date`: `timestamptz`. Momento en que ocurrió el evento físico.
- `notes`: `text` (nullable).
- `created_at`: `timestamptz`.

**Invariantes y Reglas:**
- **Inmutabilidad Absoluta**: Los registros de movimiento nunca se sobrescriben ni eliminan físicamente (ADR-002, ADR-003). Cualquier corrección se asienta como un nuevo movimiento de ajuste.
- **Saldo Derivado**: No existe un campo mutable `current_stock`. El saldo disponible en una fecha $T$ se deriva de la suma acumulada de movimientos normalizados a la unidad base del item (ADR-003, ADR-010).
- **Disparo Exclusivo por Hechos Operacionales Concluidos**: La planificación (planes y targets) **nunca mueve inventario**. Un `production_run` finalizado (`status: completed`) es **una fuente operacional legítima** que asienta atómicamente salidas de insumos (`production_input`) y entradas de producto (`production_output`) (ADR-027). Otras fuentes operacionales (como recepciones mínimas de compra según ADR-029, ventas o ajustes de inventario) generarán movimientos bajo este mismo modelo sin alterar la semántica central del Kardex.
- **Recepción Mínima de Inventario Comprado (ADR-029)**: `purchase_receipt` representa una entrada física directa de insumo comprado/recibido en taller. No constituye un módulo comercial de compras (órdenes de compra, facturación, proveedores rígidos ni cuentas por pagar), pero es un hecho operacional de entrada claramente diferenciado de saldos iniciales, ajustes por conteo físico o entradas de producción.
- **Preservación Histórica de Conversión y Normalización (ADR-031)**: Todo movimiento de inventario preserva de forma inmutable la cantidad y unidad originalmente capturadas, así como el valor normalizado a la unidad base calculado con el factor vigente al momento del evento. La normalización y los saldos son deterministas y reproducibles según el factor configurado; si el factor es aproximado (`is_approximate = true`), el resultado conserva esa condición. Un cambio posterior en la densidad o factor del item nunca altera ni recalcula retroactivamente los movimientos del Kardex pasado.

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

### 6.13 Ciclo de Vida del ProductionRun e Inmutabilidad de Hechos Ejecutados
1. Un `production_run` transiciona de manera controlada: `planned` -> `in_progress` -> `completed` (o alternativamente `cancelled`).
2. La corrida física se asocia a la `recipe_version_id` exacta que se utilizó en el taller.
3. Al alcanzar el estado `completed`, se registran el rendimiento real (`actual_yield_quantity`, `actual_yield_unit_id`), los consumos reales y el timestamp `completed_at`. A partir de este momento, el hecho físico queda congelado como historia inmutable y no debe modificarse destructivamente (ADR-026).

### 6.14 Captura Operativa de Consumos con Fricción Mínima
1. Al crear la corrida, `production_run_inputs` precarga los insumos requeridos calculados por el escalado de la receta.
2. Al terminar la producción física, la interfaz ofrece al operario una confirmación rápida: "¿Usaste las cantidades planeadas? (Sí / Hubo cambios)".
3. Si el operario confirma "Sí", el sistema valida y asienta las cantidades planificadas como consumos reales (`actual_quantity = planned_quantity`, `was_altered = false`).
4. Si indica "Hubo cambios", únicamente se capturan los insumos que variaron puntualmente (marcando `was_altered = true`). Esto minimiza la fricción de captura en el taller sin sacrificar exactitud (ADR-026).

### 6.15 Preservación Honesta de Desviaciones vs. Clasificación de Merma
1. Si una corrida planificada para 3.5 kg de masa rinde físicamente 3.42 kg, el sistema registra el rendimiento real y conserva la diferencia operacional (80 g) sin alterar la receta oficial (ADR-015, ADR-028).
2. Costara **prohíbe clasificar automáticamente las desviaciones de rendimiento como merma o desperdicio en M2**. Una variación puede originarse por evaporación, humedad ambiental, tolerancias de báscula o retención normal en equipos. La categorización y costeo formal de mermas corresponde al hito M3.

### 6.16 Movimientos de Inventario Desacoplados de la Planificación y Disparados por Hechos Concluidos
1. Ni los planes de producción ni las corridas en estado `planned` o `in_progress` generan movimientos de inventario. El plan representa una expectativa futura y no altera las existencias físicas.
2. Los movimientos de inventario (`inventory_movements`) se originan **exclusivamente a partir de hechos operacionales concluidos y confirmados**. Un `production_run` finalizado en estado `completed` es **una fuente operacional legítima** que asienta:
   - Salidas (`production_input`): Una línea de salida por cada insumo consumido en `production_run_inputs`.
   - Entrada (`production_output`): Una línea de entrada por el producto intermedio o terminado obtenido (`actual_yield_quantity`).
3. El Kardex es abierto y extensible: además de las salidas y entradas de producción, admite recepciones mínimas de inventario comprado (`purchase_receipt`, ADR-029) para ingresar insumos adquiridos sin obligar a un módulo comercial de compras en M2, así como ajustes físicos de inventario y saldos iniciales, sin alterar la estructura central del Kardex (ADR-003, ADR-027).
4. Los movimientos son inmutables. El stock disponible se deriva sumando las cantidades normalizadas del kardex histórico (ADR-003, ADR-010).
5. **Conversiones Interdimensionales Explícitas y Preservación Histórica**: Cuando un insumo fluido (ej. leche) cuya unidad base es masa (`g`) se recibe o mueve en volumen (`L`), el motor aplica la densidad/factor específico configurado para ese item (ADR-031). El movimiento asienta de manera inmutable tanto la cantidad capturada como el valor normalizado canónico. La normalización y los saldos son deterministas y reproducibles en función del factor utilizado al momento del evento; si el factor es aproximado (`is_approximate = true`), el resultado derivado conserva esa condición. Un cambio posterior en la densidad configurada del item nunca altera retroactivamente los movimientos históricos ya asentados.

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

### Escenarios de Planificación, Producción e Inventario de M2A (30 - 45)

30. **Definición de Plantilla Semanal Recurrente:**
    Un negocio crea la plantilla "Semana Regular Panara" con metas asignadas a los días 1 (Lunes) a 6 (Sábado). Las metas no contienen fechas de calendario y se almacenan como patrón reusable.

31. **Instanciación Autónoma de Plan Fechado:**
    El usuario crea el plan "Semana 38" para el periodo 2026-09-14 a 2026-09-20 seleccionando la plantilla "Semana Regular". El sistema copia las metas proyectando las fechas exactas de lunes a domingo.

32. **Modificación Puntual sin Mutar Plantilla ni Historia:**
    En el plan fechado "Semana 38", el usuario ajusta las cantidades de una meta diaria o agrega una meta extraordinaria [EJEMPLO ILUSTRATIVO HIPOTÉTICO]. La plantilla base "Semana Regular Panara" permanece intacta y los planes de semanas pasadas no se modifican.

33. **Targets con Unidades Heterogéneas en el Mismo Plan:**
    El plan consolida válidamente metas expresadas en masa (`10 kg` Natural, `base_unit: g`), piezas discretas (`20 piece` Concha, `base_unit: piece`) y unidades compuestas (`1 piece` Panqué de plátano).

34. **Derivación On-Demand de Intermedio Compartido:**
    Un plan incluye 20 Conchas, 4 Pan de Deus, 12 Trenzas, 12 Roles Canela y 6 Roles Philadelphia junto con un objetivo de taller de 3.5 kg de Masa Dulce. El motor resuelve determinísticamente las versiones de receta vigentes para la fecha del plan y, cuando las formulaciones contienen los consumos respectivos, proyecta la masa requerida para contrastarla contra el objetivo operativo sin tablas rígidas intermedias (ADR-025).

35. **Derivación de Cantidad por Pieza a partir de Receta Final (Hipótesis OPEN-001):**
    La receta de Pan de Deus declara un rendimiento de 4 piezas y un consumo de 280 g de Masa Dulce. El sistema calcula que cada pieza requiere nominalmente $280\text{ g} / 4 = 70\text{ g}$ de masa cruda sin requerir atributos específicos de panadería en el esquema.

36. **Planificación sin Impacto en Inventario:**
    La creación o edición de un plan fechado con 25 targets no genera ningún registro en `inventory_movements` ni modifica las existencias físicas disponibles de insumos.

37. **Inicio y Transición de Estados de una Corrida:**
    Un `production_run` para 3.5 kg de Masa Dulce se inicia en taller, cambiando su estado de `planned` a `in_progress` y registrando el timestamp `started_at` sin alterar el stock de insumos todavía.

38. **Confirmación Rápida de Consumos Planeados ("¿Cantidades planeadas? Sí"):**
    Al terminar una corrida de 10 kg de Natural, el operario confirma que se usaron las cantidades planeadas; el sistema valida `actual_quantity = planned_quantity` para todos los insumos con `was_altered = false` sin requerir captura manual repetitiva.

39. **Captura por Excepción de Variación de Insumos ("Hubo cambios"):**
    En un lote de Masa Dulce, el operario pesó 2.050 kg de harina en vez de los 2.000 kg planeados. El sistema asienta 2.050 kg en `production_run_inputs`, marca `was_altered = true` y mantiene la receta canónica intacta (2.000 kg).

40. **Preservación Honesta de Desviación de Rendimiento sin Merma Automática:**
    Una corrida planeada para 3.5 kg de Masa Dulce concluye con un rendimiento real de 3.42 kg. El sistema fija `actual_yield_quantity = 3.42 kg`, registra la variación operacional de 80 g y prohíbe clasificarla automáticamente como merma contable o descarte.

41. **Generación Atómica de Movimientos de Inventario al Completar Run:**
    Al pasar la corrida de Masa Dulce a estado `completed`, el sistema genera atómicamente e inmutablemente movimientos de salida (`production_input`) para harina, azúcar, huevos y mantequilla, y un movimiento de entrada (`production_output`) por 3.42 kg de Masa Dulce.

42. **Inmutabilidad y Bloqueo de Edición en Corridas Completadas:**
    Una corrida en estado `completed` no permite modificar destructivamente sus rendimientos ni consumos reales. Cualquier ajuste posterior debe realizarse mediante un movimiento de inventario de ajuste compensatorio con trazabilidad completa.

43. **Recepción Mínima de Inventario Comprado en Taller (ADR-029):**
    Al llegar 2 costales de 25 kg de Harina de Fuerza al obrador, el usuario registra una recepción de inventario (item: Harina de Fuerza, cantidad: 50 kg). El sistema genera un movimiento de entrada `purchase_receipt` en `inventory_movements`, aumentando las existencias disponibles sin requerir órdenes de compra ni proveedores formales.

44. **Preservación de Versión al Planificar y Alerta Preventiva ante Nueva Versión (ADR-030):**
    El domingo se crea una meta de 20 Conchas en un plan para el miércoles, guardando como snapshot la versión vigente en ese momento (`Concha v1`). El lunes se publica `Concha v2`. Al consultar el plan, el sistema preserva `recipe_version_id = v1` sin modificar silenciosamente el target, pero visibiliza que rige `v2` para esa fecha. Al ejecutar la corrida el miércoles, `production_run` congela de forma inmutable la versión que efectivamente se produjo.

45. **Recepción y Consumo Interdimensional con Densidad Específica (ADR-031):**
    El item "Leche entera" tiene unidad base `g` y un factor configurado de `1 ml = 1.03 g`. Al recibir 2 Litros de leche, el sistema normaliza de forma determinista la entrada a 2060 g en `inventory_movements`. Al consumir 1850 g en una corrida de producción, el kardex registra la salida de 1850 g, resultando en un saldo determinista y reproducible de 210 g (que conservará su naturaleza aproximada si el factor fue configurado como tal). Si semanas después se ajusta la densidad del item a 1.032 g/ml, los 2060 g históricos del movimiento no se recalculan.
