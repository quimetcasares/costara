# Modelo de Datos y Principios del Dominio - Costara (M0 & M1A)

Este documento define el modelo conceptual de dominio para Costara, sus entidades fundamentales, relaciones, invariantes, reglas de cálculo y escenarios de aceptación. En esta etapa (M1A), el modelo se define a nivel puramente conceptual y documental sin código SQL de implementación ni migraciones.

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

## 5. Reglas del Dominio, Dinámica Operativa y Algoritmos Conceptuales

### 5.1 Rendimiento de Referencia y Porciones Teóricas
1. La formulación de una receta se define para un lote de referencia expresado en `reference_yield_quantity` y `reference_yield_unit_id` (ej. 14 kg de mezcla).
2. Si el producto final se divide en unidades discretas, se define `portion_quantity` y `portion_unit_id` (ej. 1.1 kg por pieza cruda).
3. Las porciones teóricas se calculan on-demand dividiendo el rendimiento entre la porción. El sistema acepta y conserva valores no enteros sin redondearlos forzosamente ni considerarlos errores.

### 5.2 Escalado de Recetas como Operación de Planificación
1. Escalar una receta consiste en proyectar las cantidades de insumos para alcanzar un objetivo de producción deseado (ej. producir 12 piezas en lugar de las 6 de referencia, o preparar 28 kg de mezcla).
2. El factor de escala se calcula como:
   $$\text{Factor de Escala} = \frac{\text{Cantidad Objetivo}}{\text{Cantidad de Referencia}}$$
3. Todas las cantidades absolutas y bases porcentuales se multiplican por el mismo factor de escala de forma proporcional.
4. **El escalado es transitorio y reproducible**: Se calcula en memoria para fines de visualización o planificación de órdenes, **sin crear nuevas versiones en `recipe_versions` ni mutar la versión canónica**.

### 5.3 Formulación Nominal vs. Realidad Operativa (Frontera con Producción)
1. `recipe_versions` representa la expectativa teórica o estándar de operación.
2. En la operación diaria, las cantidades efectivamente pesadas o consumidas y los rendimientos logrados pueden variar por múltiples factores reales.
3. En hitos posteriores (`M2 - Production`), el sistema registrará los eventos reales de producción (cantidades planificadas vs cantidades reales consumidas y rendimientos reales obtenidos). Las desviaciones se conservan como datos de aprendizaje operativo y no alteran la receta canónica.

### 5.4 Insumos Absolutos, Porcentuales y Resolución de Bases
1. **Insumo Absoluto**: Se define con cantidad física fija para el lote de referencia (ej. Harina Blanca: 10 kg).
2. **Insumo Porcentual**: Se calcula respecto a la suma de las cantidades normalizadas de sus insumos base asociados en `recipe_input_percentage_bases`.
   $$\text{Cantidad Calculada} = \left( \sum_{b \in \text{Bases}} \text{Cantidad Normalizada}(b) \right) \times \frac{\text{percentage}}{100}$$
3. **Bases Compuestas**: Un insumo porcentual puede tomar como base múltiples insumos (ej. 10% de masa madre sobre una base de 10 kg de harina blanca + 4 kg de harina integral = 1.4 kg).
4. **Aciclicidad**: Toda la red de dependencias entre insumos porcentuales debe ser acíclica y resoluble de forma determinista en una pasada topológica.

### 5.5 Conversiones Contextuales Aproximadas (`is_approximate`)
1. Las conversiones contextuales con `is_approximate = true` (ej. 1 tanto ≈ 155 g) permiten que los operarios visualicen y capturen datos en unidades empíricas familiares.
2. Si una receta calcula que se requieren 1.400 kg de masa madre, la interfaz puede informar complementariamente *"≈ 9 tantos"*, manteniendo siempre los 1.400 kg como la cantidad canónica exacta para el cálculo de costos e inventario.

### 5.6 Costeo Recursivo de Items Producidos y Recetas Anidadas
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

### 5.7 Prohibición y Detección de Ciclos
1. Las dependencias entre recetas para fines de costeo **no pueden formar ciclos directos ni indirectos**:
   - Directo: Receta A consume el mismo Item A que produce.
   - Indirecto: Receta A produce Item A y consume Item B; Receta B produce Item B y consume Item A.
2. Cualquier ciclo provocaría recursión infinita en el motor de costos. Los ciclos deben ser detectados y rechazados durante la validación y cálculo de recetas (formalizado en M1C).

### 5.8 Costos por Capas y Frontera con Costos Futuros
1. **Enfoque modular**: En M1 se implementa de forma estricta el **Costo Directo de Materiales**.
2. Capas de costo adicionales (mano de obra directa, energéticos como gas/luz, empaque, factores de merma y prorrateo de costos fijos) se integrarán en hitos posteriores.
3. La interfaz de usuario en M1 comunicará explícitamente *"Costo directo de materiales"*, evitando términos engañosos como *"Costo total"* o *"Ganancia neta"*.

### 5.9 Precios de Venta, Márgenes y Objetivos Configurables
1. El precio de venta al cliente es una variable comercial independiente del costo directo. Costara no aplica fórmulas de fijación de precio universales ni restrictivas.
2. Se contemplan objetivos de margen porcentual configurables a dos niveles:
   - **Objetivo General del Negocio**: Margen benchmark global (ej. 60%).
   - **Objetivos Específicos por Producto**: Sobreescritura para items individuales (ej. producto gancho al 25%, producto estrella al 68%).
3. Los objetivos operan como indicadores visuales de salud financiera (benchmarks), no como bloqueos operativos para vender o facturar.

### 5.10 Insumos Intermedios: Costo vs. Precio de Venta
Cuando un item producido (ej. "Mermelada de Fresa") posee un precio de venta al público y es consumido como insumo en otra preparación (ej. "Rol de Fresa"), el motor de costeo utiliza estrictamente su **costo directo producido o comprado**, **nunca su precio de venta al público**.

---

## 6. Validación Conceptual con Caso Panara

Los siguientes ejemplos ilustran la flexibilidad del modelo agnóstico aplicado al caso de panadería sin incorporar nombres de dominio en el esquema:
- **Agua pesada en báscula**: El item "Agua" tiene `base_unit_id = gram` (dimensión `mass`), reflejando que en la práctica se pesa en lugar de medir por volumen.
- **Masa madre base vs. Masa madre hija**: Se modelan como dos items distintos. "Masa madre hija" es el `output_item_id` de una receta de refresco y el insumo de la receta de "Hogaza".
- **Conversión aproximada de tanto**: "Masa madre hija" tiene la conversión `1 tanto ≈ 155 g` con `is_approximate = true`.
- **Porcentaje de Panadero**: En la receta de Hogaza, la harina blanca (10 kg) y la harina integral (4 kg) son insumos absolutos que forman la base porcentual compuesta (14 kg total). La masa madre se formula como `percentage = 10%`, resultando en 1.400 kg.
- **Rendimiento y porciones**: Rendimiento base de 14 kg de masa con porción de 1.1 kg produce 12.7272... porciones teóricas.
- **Escalado**: Para producir 20 porciones, Costara calcula el factor de escala proporcional y ajusta los insumos sin modificar la versión canónica de la receta.

---

## 7. Principios Transversales del Modelo

### 7.1 Aislamiento Multi-Tenant Estricto
Toda entidad operativa contiene `business_id` obligatorio para garantizar el aislamiento de datos entre empresas clientes mediante Row Level Security (RLS).

### 7.2 Inmutabilidad de Hechos y Versiones Publicadas
Las versiones activas de recetas, los registros históricos de costos de insumos y los movimientos operacionales nunca se sobrescriben. Los cambios generan nuevas versiones o nuevos registros con fecha de vigencia.

### 7.3 Precisión Monetaria y Numérica sin Floating Point
Todas las cantidades, rendimientos, porcentajes y valores monetarios se almacenan como tipos decimales exactos (`numeric`/`decimal`), eliminando errores de redondeo de punto flotante.

### 7.4 Separación entre Datos Fuente y Métricas Derivadas
Las porciones teóricas, los factores de escalado, los costos producidos recursivos y los márgenes son métricas derivadas calculadas on-demand a partir de hechos fuente inmutables.

---

## 8. Escenarios de Aceptación (Acceptance Scenarios)

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
