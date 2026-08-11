# Reglas Permanentes para Agentes de Programación - Costara

Este archivo contiene las directrices obligatorias para cualquier agente de Inteligencia Artificial o desarrollador que trabaje en el repositorio de Costara.

---

## 1. Alineación Arquitectónica y de Producto

1. **Consulta de Documentación Exigida**: Antes de realizar cualquier cambio arquitectónico o de diseño de modelo de datos, debes leer y comprender la documentación contenida en `/docs` (`PRODUCT.md`, `DATA_MODEL.md`, `DECISIONS.md`, `ROADMAP.md`).
2. **Inmutabilidad de Decisiones Documentadas**: No cambies decisiones ni principios documentados en las ADRs (`DECISIONS.md`) de forma silenciosa.
3. **Manejo de Conflictos con ADRs**: Si una nueva necesidad o requerimiento entra en conflicto con una ADR existente, debes señalar la contradicción explícitamente al usuario antes de modificar la arquitectura.
4. **Alcance del Milestone**: No implementes funcionalidades pertenecientes a hitos futuros. Trabaja exclusivamente dentro del marco del hito activo indicado en `ROADMAP.md`.
5. **Agnosticismo de Industria**: No asumas que el dominio siempre será una panadería. La panadería es el caso de estudio inicial; el diseño del código debe ser genérico y configurable.

---

## 2. Calidad de Código y Estándares Técnicos

1. **TypeScript Estricto**: Mantén TypeScript en modo estricto (`strict: true`). Resuelve los tipos adecuadamente sin recurrir a `any` ni ignorar linter errors.
2. **Claridad y Simplicidad**: Prioriza la legibilidad, mantenibilidad y simplicidad por sobre trucos de código complejos.
3. **Evitar Abstracciones Prematuras**: Diseña soluciones simples y concretas para el problema actual ("YAGNI").
4. **Dependencias Mínimas**: Evita agregar dependencias innecesarias al proyecto. Si se requiere una nueva librería, justifica su inclusión.

---

## 3. Manejo de Datos y Base de Datos

1. **Seguridad de Secretos**: Nunca guardes llaves privadas, contraseñas o secretos reales en el repositorio ni en archivos versionados por Git.
2. **Conexión a Bases de Datos**: Queda estrictamente prohibido intentar conectarse a bases de datos de producción desde entornos de desarrollo o scripts automáticos.
3. **Cambios de Esquema mediante Migraciones**: Todo cambio en el esquema de la base de datos debe realizarse exclusivamente a través de archivos de migración de Supabase en `supabase/migrations/`.
4. **Inmutabilidad de Migraciones Aplicadas**: No modifiques ni elimines migraciones históricas que ya hayan sido aplicadas en entornos compartidos o de producción.
5. **Conservación de Datos Históricos**: Garantiza que el código no sobrescriba ni destruya eventos o hechos históricos relevantes.
6. **Manejo Monetario sin Floating Point**: Nunca utilices tipos de punto flotante (`float`/`double`) para representar valores monetarios. Utiliza enteros (centavos) o decimales exactos (`numeric`/`decimal`).
7. **Pruebas Automatizadas**: Las reglas críticas del dominio (conversiones, cálculos de costo, reglas de inventario) deben estar cubiertas por tests automatizados.

---

## 4. Flujo de Trabajo y Comunicación

1. **Explicación Previa del Plan**: Antes de ejecutar cualquier modificación grande o compleja en el código, explica primero el plan de acción y espera la confirmación correspondiente.
