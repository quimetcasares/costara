# Roadmap de Desarrollo - Costara

Este documento describe la secuencia congelada y deliberada de hitos para el desarrollo de la plataforma Costara.

---

## Propósito y Regla de Estabilidad

1. **Definición de Secuencia y Límites**: Este ROADMAP define el orden de ejecución y los límites deliberados de alcance de cada hito. Su objetivo es mantener el foco y evitar desvíos o inflación descontrolada de alcance (*scope creep*).
2. **No es un Backlog Abierto**: Nuevas ideas, sugerencias o funcionalidades potenciales no se insertan automáticamente aquí.
3. **Canalización de Hallazgos**: Todo hallazgo o discrepancia descubierto durante la implementación debe registrarse primero en `docs/DECISIONS.md` como decisión abierta (OPEN item).
4. **Cambios Deliberados**: Modificar las fronteras o el alcance de un hito requiere una decisión explícita de arquitectura o de producto, la cual debe quedar formalmente documentada antes de actualizar este archivo.

---

## Hitos de Desarrollo

### M0 - Foundation [COMPLETADO]
* **Objetivo**: Fundación técnica, base de datos relacional, modelos iniciales de items/unidades, autenticación y aislamiento multi-tenant estricto.
* **Alcance cubierto**:
  - Configuración del stack (React 19, TypeScript, Vite, Tailwind, Supabase local, PostgreSQL, Vitest).
  - Modelo conceptual inicial de items y unidades dimensionales.
  - Esquema relacional con migraciones inmutables y RLS multi-tenant por `business_id`.
  - Pruebas de integración de autenticación y aislamiento.
* **Subhitos**:
  - [x] M0.1: Fundación del proyecto -> [COMPLETADO]
  - [x] M0.2A: Documentación del modelo de dominio inicial -> [COMPLETADO]
  - [x] M0.2B: Implementación de base de datos -> [COMPLETADO]
  - [x] M0.3: Autenticación y aislamiento multi-tenant -> [COMPLETADO]

---

### M1 - Cost calculation vertical slice [COMPLETADO / CERRADO]
* **Objetivo**: Rebanada vertical funcional completa de formulación y costeo directo de materiales para recetas, desde la persistencia hasta la interfaz de usuario.
* **Qué pertenece a M1**:
  - Catálogo de items con capacidades operativas independientes (`kind`, `purchasable`, `producible`, `sellable`, `track_inventory`).
  - Unidades de medida seguras por dimensión (masa, volumen, conteo) y conversiones específicas por item.
  - Recetas con identidad permanente desacoplada de versiones históricas inmutables con estados (`draft`, `active`, `archived`).
  - Historial de costos de insumos comprados con vigencia temporal (`item_cost_versions`).
  - Insumos de receta con cantidades absolutas o porcentuales (bases explícitas y acíclicas).
  - Motor de cálculo determinista en TypeScript puro (`recipeCalculator`, `costingEngine`, `scalingEngine`, `formulaResolver`, `yieldResolver`) con aritmética exacta `CostaraDecimal`.
  - Soporte de costeo recursivo multinivel para insumos producidos intermedios (subrecetas).
  - Interfaz de usuario interactiva: visualización de receta, árbol jerárquico de costos, controles de escalado, editor de borradores, cálculo de previsualización y modal de publicación con timezone de negocio.
* **Qué NO pertenece a M1**:
  - Costo de mano de obra, energía, servicios o costos indirectos fijos (ADR-019).
  - Empaque dependiente del pedido, venta o despacho (OPEN-004).
  - Conversiones inter-dimensionales automáticas (volumen a masa sin densidad explícita) (OPEN-002).
  - Cantidad nominal de masa por pieza estructurada en schema (OPEN-001).
  - Registro de producciones reales ejecutadas o consumos reales de taller (ADR-015, reservado a M2).
  - Control de existencias o inventario físico en tiempo real (reservado a M2).
  - Registro y costeo de mermas reales en ejecución (OPEN-005, reservado a M3).
* **Subhitos**:
  - [x] M1A: Documentación de recetas y costos directos -> [COMPLETADO]
  - [x] M1B: Implementación del schema de recetas/costos -> [COMPLETADO]
  - [x] M1C: Motor de cálculo y escalado -> [COMPLETADO]
  - [x] M1D: Vertical slice UI -> [COMPLETADO]

---

### M2 - Production and inventory [PLANIFICADO]
* **Objetivo**: Registro operacional de lotes de producción ejecutados, consumos reales y movimientos de inventario.
* **Qué pertenece a M2**:
  - Planificación y registro de lotes de producción vinculados a versiones aprobadas de recetas.
  - Captura de consumos reales de materia prima y rendimientos reales obtenidos (ADR-015).
  - Kardex de movimientos de inventario (entradas, salidas, ajustes) derivado de hechos inmutables (ADR-003).
* **Qué NO pertenece a M2**:
  - Registro de ventas a clientes finales ni facturación.
  - Determinación de resultado contable u operativo final.

---

### M3 - Sales, waste and operational result [PLANIFICADO]
* **Objetivo**: Registro de ventas comerciales, seguimiento formal de mermas e indicadores de resultado operativo del negocio.
* **Qué pertenece a M3**:
  - Registro de ventas de producto terminado.
  - Registro formal de mermas (daño, caducidad, merma en proceso) y descarte.
  - Comparativa analítica entre formulación nominal teórica vs costo real incurrido.
* **Qué NO pertenece a M3**:
  - Contabilidad financiera compleja, nóminas o módulos fiscales de ERP corporativo.

---

### M4 - Real-world pilot [PLANIFICADO]
* **Objetivo**: Despliegue, adopción y validación operativa en el entorno real de trabajo de Panara.
* **Qué pertenece a M4**:
  - Validación de usabilidad con el equipo de panadería en sus horarios y condiciones cotidianas.
  - Pruebas de campo de captura de recetas, compras y lotes reales.

---

### M5+ - Continuous evolution from real usage [POR DEFINIR]
* **Objetivo**: Evolución del sistema y funciones configurables guiadas exclusivamente por evidencia empírica del piloto real.
