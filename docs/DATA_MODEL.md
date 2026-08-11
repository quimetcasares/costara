# Modelo de Datos Inicial y Principios del Dominio - Costara (M0.2A)

Este documento define el modelo conceptual de dominio para Costara, sus entidades fundamentales, relaciones, invariantes y reglas de negocio. En esta etapa (M0.2A), el modelo se define a nivel puramente conceptual y documental sin código SQL de implementación.

---

## 1. Objetivo del Modelo M0.2

Establecer las bases conceptuales para representar los negocios, usuarios, unidades de medida universales, aliases de interpretación, catálogo de items (insumos y productos) y conversiones específicas por item. Este modelo soporta la filosofía de Costara: **"Specific today, configurable tomorrow, extensible always"**, permitiendo que el primer caso de uso (panadería) se modele de forma limpia sin condicionar la arquitectura para otros sectores de producción.

---

## 2. Separación Global vs. Propiedad del Negocio (Tenant-owned)

Para garantizar la seguridad y el aislamiento multi-tenant desde la estructura, los conceptos del dominio se dividen claramente en dos capas de pertenencia:

### Entidades Globales (Compartidas por la plataforma)
- `unit_dimensions`: Dimensiones físicas universales.
- `units`: Unidades de medida estándar universales.
- `unit_aliases` (globales, donde `business_id` es `NULL`): Aliases de interpretación comunes a nivel sistema.

### Entidades Propiedad del Negocio (Tenant-owned)
- `businesses`: Representación del negocio/empresa.
- `business_members`: Membresía y roles de usuarios dentro de un negocio.
- `items`: Catálogo de insumos, semielaborados, productos terminados y empaques del negocio.
- `item_unit_conversions`: Presentaciones o empaques específicos de un item en un negocio.
- `unit_aliases` (personalizados, donde `business_id` está definido): Sinónimos o modismos propios de un negocio.

---

## 3. Especificación de Entidades Conceptual de M0.2

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

**Dimensiones iniciales en M0.2:**
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
- `is_active`: `boolean` (default `true`). Estado de activación del item.
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

### 3.7 `item_unit_conversions`
Representa empaques, contenedores, presentaciones o medidas operativas **específicas de un item dentro de un negocio**.

**Aclaración Fundamental:** Conceptos contextuales o volumétricos de empaque como `costal`, `caja`, `barra`, `lata`, `taza`, `charola`, `paquete` o `tanto` **NO son unidades universales de medida** y **NUNCA deben agregarse a `units`**. Son conversiones específicas dependientes de la densidad, masa o empaque de un item concreto.

**Campos conceptuales:**
- `id`: UUID (Primary Key).
- `business_id`: UUID (FK a `businesses`). Negocio propietario.
- `item_id`: UUID (FK a `items`). Item al que aplica la conversión.
- `name_singular`: `text`. Nombre de la presentación en singular (ej. "Costal", "Caja", "Barra", "Taza").
- `name_plural`: `text` (nullable). Nombre en plural (ej. "Costales", "Cajas").
- `quantity`: `numeric` de alta precisión. Cantidad contenida.
- `unit_id`: UUID (FK a `units`). Unidad de medida en la que se expresa la cantidad contenida.
- `is_active`: `boolean` (default `true`). Estado de la conversión.
- `created_at`: `timestamptz`.
- `updated_at`: `timestamptz`.

**Ejemplos Reales de Conversiones por Item:**
- **Harina (base = g)**: `1 costal = 25 kg` (Contenido: 25, Unidad: `kg` -> equivale a 25,000 g).
- **Azúcar (base = g)**: `1 costal = 50 kg` (Contenido: 50, Unidad: `kg` -> equivale a 50,000 g).
- **Huevo (base = piece)**: `1 caja = 360 piece` (Contenido: 360, Unidad: `piece`).
- **Chocolate (base = g)**: `1 barra = 10 g` (Contenido: 10, Unidad: `g`).
- **Harina (base = g)**: `1 taza = 120 g` (Contenido: 120, Unidad: `g`).

**Invariante de Compatibilidad Dimensional:**
La unidad de destino (`unit_id`) de la conversión debe pertenecer obligatoriamente a la **misma dimensión física** que la unidad base (`base_unit_id`) del item.
- *Válido:* Harina (base `g`, dimensión `mass`) -> `1 costal = 25 kg` (`kg` pertenece a `mass`).
- *Inválido:* Harina (base `g`, dimensión `mass`) -> `1 costal = 25 L` (`L` pertenece a `volume`).

**Invariante de Unicidad de Conversiones Activas por Item:**
No pueden existir dos conversiones **activas** (`is_active = true`) para el mismo item que compartan el mismo nombre contextual (`name_singular`), comparado de forma case-insensitive.
- *Válido:* Harina (`1 costal = 25 kg`) y Azúcar (`1 costal = 50 kg`) dentro del mismo negocio.
- *Válido:* Harina (`1 costal = 25 kg` desactivo `is_active = false`) y nueva Harina (`1 COSTAL = 30 kg` activo `is_active = true`).
- *Inválido:* Harina (`1 costal = 25 kg` activo) y Harina (`1 COSTAL = 30 kg` activo).

---

## 4. Principios Transversales del Modelo

### 4.1 Aislamiento Multi-Tenant (Global vs. Tenant-Owned)
Toda entidad perteneciente a un negocio debe incluir de forma explícita la columna `business_id` para permitir el aislamiento seguro y la aplicación futura de RLS (Row Level Security).

### 4.2 Inmutabilidad y Desactivación Lógica (Soft Deactivation)
Para preservar la trazabilidad e integridad de referencias históricas (recetas pasadas, compras, consumos), los items y conversiones que hayan sido referenciados **no deben ser eliminados de forma destructiva**. Se debe utilizar la desactivación lógica mediante `is_active = false`.

### 4.3 Precisión Monetaria y Numérica (Sin Floating Point)
- Todas las cantidades, factores de conversión y equivalencias deberán utilizar tipos decimales exactos en PostgreSQL (`numeric` / `decimal`).
- Bajo ninguna circunstancia se utilizarán tipos de punto flotante (`float` / `double`) para cantidades que afecten inventarios, conversiones o costos.

### 4.4 Separación entre Datos Fuente y Métricas Derivadas
Las entidades de M0.2 almacenan hechos y configuraciones primarias del dominio. Los niveles de stock acumulados o costos derivados se calcularán on-demand o en vistas materializadas a partir de la historia.

---

## 5. Escenarios de Aceptación (Acceptance Scenarios)

Los siguientes casos de prueba conceptuales verifican la validez del modelo de datos de M0.2A:

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
