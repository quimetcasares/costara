# Reglas Permanentes para Agentes de Programación - Costara

Este archivo contiene las directrices obligatorias para cualquier agente de Inteligencia Artificial o desarrollador que trabaje en el repositorio de Costara.

---

## 1. Alineación Arquitectónica y Gobernanza Documental

1. **Jerarquía Documental Obligatoria**:
   - `ROADMAP.md`: Define el alcance congelado y la secuencia deliberada de hitos.
   - `DECISIONS.md`: Registro único de decisiones aprobadas (ADRs) y de decisiones abiertas/hallazgos pendientes de resolución.
   - `DATA_MODEL.md`: Describe el modelo de datos vigente, implementado o formalmente aprobado.
   - `PRODUCT.md`: Intención de negocio, filosofía y principios rectores de producto.

2. **Estabilidad Documental**:
   - No conviertas `ROADMAP.md` en backlog de ideas, diario de desarrollo ni lista de bugs.
   - No conviertas `DATA_MODEL.md` en repositorio de ideas especulativas o borradores no aprobados.
   - Toda nueva idea o hallazgo debe documentarse primero en `DECISIONS.md` como decisión abierta antes de tocar otros documentos.

3. **Regla para Hallazgos Nuevos de Dominio**:
   Si durante la implementación o validación aparece una necesidad real que no cabe limpiamente en el modelo actual:
   - 1. NO improvisar schema ni agregar columnas al vuelo.
   - 2. NO reinterpretar silenciosamente campos existentes (por ejemplo, reutilizar campos con una semántica diferente).
   - 3. NO crear abstracciones específicas o parches exclusivos de una sola receta para forzar que pase el caso.
   - 4. Registrar el hallazgo de inmediato como decisión abierta (OPEN item) en `DECISIONS.md`.
   - 5. Continuar con la tarea solo si el milestone activo puede cerrarse correctamente sin resolver ese hallazgo.
   - 6. Si el hallazgo bloquea el milestone, detenerse de inmediato y solicitar decisión explícita al usuario.

4. **Regla de Casos Reales (Golden Cases)**:
   - Los casos reales de validación (como formulaciones operativas de Panara) son la máxima autoridad sobre la receta física conocida.
   - Queda estrictamente prohibido modificar o alterar fixtures reales para acomodarlos a resultados erróneos o limitaciones temporales del motor de cálculo.
   - Si un Golden Case descubre un conflicto real en el motor o en el modelo, repórtalo con claridad antes de tocar el dominio o la arquitectura.

5. **Inmutabilidad de Decisiones Documentadas**: No cambies decisiones ni principios documentados en las ADRs (`DECISIONS.md`) de forma silenciosa.
6. **Manejo de Conflictos con ADRs**: Si una nueva necesidad o requerimiento entra en conflicto con una ADR existente, debes señalar la contradicción explícitamente al usuario antes de modificar la arquitectura.
7. **Alcance del Milestone**: No implementes funcionalidades pertenecientes a hitos futuros. Trabaja exclusivamente dentro del marco del hito activo indicado en `ROADMAP.md`.
8. **Agnosticismo de Industria**: No asumas que el dominio siempre será una panadería. La panadería es el caso de estudio inicial; el diseño del núcleo debe ser genérico, desacoplado y configurable.

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
