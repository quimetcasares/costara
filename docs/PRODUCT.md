# Visión de Producto - Costara

## ¿Qué es Costara?

Costara es una plataforma configurable diseñada para ayudar a pequeños y medianos negocios que producen bienes físicos a modelar su operación, registrar lo que ocurre en el día a día y comprender la realidad financiera y operativa de su negocio.

La plataforma proporciona visibilidad sobre:
- Costos
- Producción
- Inventario
- Compras
- Ventas
- Merma
- Rentabilidad
- Procesos operativos

## Problema que resuelve

Los pequeños y medianos negocios de producción operan frecuentemente sin visibilidad clara de sus costos reales de fabricación, mermas ocultas o márgenes por producto. Las soluciones existentes suelen ser hojas de cálculo frágiles o sistemas ERP rígidos, costosos y complejos. Costara busca cerrar esta brecha ofreciendo un modelo flexible y liviano adaptado a la dinámica operativa real.

## Primer caso de uso y vertical inicial

- **Primer usuario real**: Un negocio pequeño de producción.
- **Vertical inicial**: Panadería.

### Principio de diseño vertical
La panadería constituye el **primer caso de uso de prueba y validación real**, pero **NO es una restricción arquitectónica**. El núcleo del sistema se diseña de manera agnóstica para permitir la adaptación futura a diversas industrias de producción o manufactura ligera.

## Principios del Producto

> *"Specific today, configurable tomorrow, extensible always."*

1. **Retorno de Inversión Claro**: Toda interacción o registro en Costara debe cumplir al menos uno de estos tres objetivos:
   - Ahorrar tiempo al usuario.
   - Ahorrar dinero al negocio.
   - Ayudar a tomar mejores decisiones operativas o financieras.

2. **Captura de Datos con Mínimo Esfuerzo**: El registro de la operación diaria debe requerir la menor fricción posible para el personal operativo, priorizando la agilidad de captura sobre la burocracia de datos.

3. **Conservación de Historia Operativa**: El sistema debe almacenar el historial completo y continuo de eventos (compras, producciones, ventas, mermas, cambios de recetas y precios) para habilitar analítica retrospectiva confiable.

4. **Visión Futura (IA y Aprendizaje)**: Al conservar historia estructurada de la operación, Costara evolucionará en etapas posteriores hacia la configuración asistida por inteligencia artificial, la detección automática de anomalías/patrones y la recomendación personalizada basada en hábitos operativos.

---

## Principios Fundamentales de Formulación, Costos y Operación (M1)

### 1. Formulación Nominal vs. Ejecución Real

> *"Costara modela la forma esperada de operar, pero no asume que la operación real será idéntica. Las desviaciones entre fórmula, planificación y ejecución son datos valiosos que deben conservarse."*

- **La receta como expectativa**: Una fórmula precisa sirve como referencia nominal y base de planificación.
- **Realidad operacional y prueba/error**: En el día a día físico, la ejecución real puede desviarse debido a factores como la experiencia del operador, variabilidad en la materia prima, tamaño de lote, personal en turno o condiciones ambientales (temperatura, humedad).
- **Desviaciones no son errores**: Costara no trata automáticamente las discrepancias entre lo formulado y lo producido como fallas de sistema, sino como hechos operacionales legítimos cuya captura enriquece el aprendizaje del negocio.

### 2. Recetas Históricas y Escalado Dinámico

- **Identidad y evolución**: Una receta representa la identidad lógica y la evolución continua de un producto a través del tiempo mediante versiones históricas inmutables (`recipe_versions`).
- **Escalado como planificación**: Adaptar una receta a un volumen de producción diario (por ejemplo, escalar de 6 piezas base a 12, 17 o a 14 kg de masa) es una operación matemática transitoria y reproducible. El escalado **no muta la versión canónica ni genera nuevas versiones de receta**.

### 3. Estructura de Costos por Capas

Costara no concibe el "costo del producto" como un valor monolítico o estático. El costo se modela de manera modular y por capas acumulativas:

$$\text{Costo Completo Estimado} = \text{Materiales Directos} + \text{Mano de Obra} + \text{Energía/Servicios} + \text{Empaque} + \text{Merma} + \text{Costos Fijos Asignados}$$

- **Alcance inicial de materiales (M1)**: En este hito se modela exclusivamente el **Costo Directo de Materiales**.
- **Transparencia en la interfaz**: Mientras el sistema solo conozca los insumos de materiales, la interfaz comunicará con exactitud *"Costo directo de materiales"* y no *"Costo total"* ni *"Ganancia neta"*.

### 4. Independencia entre Precio de Venta y Costo

- **Precios desacoplados**: El precio de venta al público es una decisión comercial y estratégica independiente del costo; no está atado a multiplicadores o fórmulas fijas universales (ej. `precio = costo * 3.3`), las cuales pueden ser hábitos de un negocio particular pero no una ley del sistema.
- **Márgenes y objetivos configurables**: Costara distingue conceptualmente entre *markup* y *margen*. El sistema contempla la definición de objetivos de margen a nivel general del negocio, con la capacidad de que productos específicos (ej. productos gancho o con márgenes premium) definan objetivos propios. Los márgenes objetivo operan como benchmarks orientativos, no como restricciones que bloqueen la operación.

### 5. Costeo de Insumos Intermedios Producidos

Cuando un producto elaborado internamente (por ejemplo, una mermelada o una masa madre) se consume como ingrediente en otra receta compuesta (como unos roles o un pan rústico), su costo de input se deriva directamente de su **costo de producción o adquisición**, **nunca de su precio de venta comercial**.
