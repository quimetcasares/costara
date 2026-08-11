# Principios del Modelo de Datos - Costara

Este documento establece las directrices arquitectónicas que regirán el diseño del modelo de datos de Costara. Actualmente no define tablas SQL concretas, sino los principios fundamentales del dominio.

## Principios del Modelo de Datos

1. **Pertenencia a Negocio (Multi-tenancy desde la Arquitectura)**: Todos los datos operativos deberán pertenecer explícitamente a un negocio (`tenant`). Costara nace estructurado para soportar múltiples empresas de forma aislada e independiente.
2. **Multiempresa Nativo**: La separación de datos, permisos y configuraciones por negocio se contempla como un requisito estructural primordial desde el día cero.
3. **Unidades y Conversiones como Núcleo del Dominio**: Las unidades de medida y sus conversiones constituyen una pieza fundamental del modelo operativo y financiero.
4. **Conversiones Universales vs. Específicas del Negocio**: Existirán unidades de medida estándar/universales (ej. kilogramos a gramos, litros a mililitros) y conversiones específicas configurables por cada negocio (ej. 1 bulto de harina = 44 kg).
5. **Composición de Recetas**: Una receta o fórmula operativa podrá consumir insumos primarios u otras preparaciones interactivas (sub-recetas o productos semielaborados).
6. **Resultado de Receta**: Una receta produce un item (producto final o insumo procesado).
7. **Conservación de Historia en Recetas, Costos y Precios**: Las versiones de recetas, las variaciones de costos de insumos y la lista de precios deben conservar su historial a lo largo del tiempo.
8. **Inmutabilidad de Hechos Históricos (Eventos Reales)**: Compras, órdenes de producción, ventas, mermas y otros hechos relevantes representan eventos reales que ocurrieron en el mundo físico y no deben ser modificados retroactivamente ni eliminados.
9. **No Sobrescribir Históricos**: Los registros históricos importantes no deben sobrescribirse ni destruirse para mantener la trazabilidad operativa y financiera.
10. **Inventario Derivado de Movimientos**: El nivel de inventario se derivará a partir de la secuencia contable de movimientos (entradas, salidas, mermas, transformaciones), y no exclusivamente de un campo mutable `current_stock`.
11. **Separación entre Fuente de Verdad y Métricas Derivadas**: Los hechos operativos (eventos) son la única fuente de verdad; los cálculos derivados (saldos, promedios, agregaciones) son vistas calculadas o proyecciones.
12. **Precisión Financiera (Sin Floating Point)**: Los valores monetarios y financieros bajo ninguna circunstancia deberán utilizar números de punto flotante (`float`/`double`).
13. **Precisión Suficiente en Cantidades**: El registro de cantidades debe soportar precisión numérica arbitraria/suficiente para manejar unidades de medida muy pequeñas (ej. gramos de levadura, mililitros de esencia).
