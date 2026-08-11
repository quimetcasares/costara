# Costara

Costara es una plataforma configurable diseñada para ayudar a pequeños y medianos negocios de producción (iniciando con el caso de uso de panadería) a modelar su operación, registrar eventos diarios y comprender sus costos, inventarios y resultados.

---

## Technical Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Backend / Database**: Supabase (PostgreSQL, Auth, RLS) local mediante Supabase CLI y Docker
- **Linter**: Oxlint

---

## Requisitos Previos

- [Node.js](https://nodejs.org/) (v18 o superior)
- [Docker Desktop](https://www.docker.com/) (necesario para la ejecución del entorno local de Supabase)

---

## Configuración y Desarrollo Local

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia el archivo de ejemplo para crear tu entorno local:

```bash
cp .env.example .env.local
```

### 3. Iniciar Supabase local

Con Docker ejecutándose en tu equipo:

```bash
npx supabase start
```

Para consultar las credenciales e URLs del entorno local de Supabase:

```bash
npx supabase status
```

Para detener los servicios locales de Supabase:

```bash
npx supabase stop
```

### 4. Ejecutar el servidor de desarrollo de Vite

```bash
npm run dev
```

El servidor estará disponible por defecto en `http://localhost:5173`.

---

## Scripts Disponibles

- `npm run dev`: Inicia el servidor de desarrollo Vite con HMR.
- `npm run build`: Compila el proyecto con TypeScript (`tsc -b`) y genera el bundle de producción en Vite.
- `npm run lint`: Ejecuta el análisis estático de código con Oxlint.
- `npm run preview`: Sirve localmente la compilación de producción.

---

## Documentación Arquitectónica

Toda la documentación conceptual, principios del modelo de datos y decisiones de arquitectura se encuentran en el directorio [`docs/`](./docs/):

- [`docs/PRODUCT.md`](./docs/PRODUCT.md): Visión de producto, contexto y principios de ROI.
- [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md): Principios estructurales del dominio y modelo de datos.
- [`docs/DECISIONS.md`](./docs/DECISIONS.md): Registro de Decisiones de Arquitectura (ADRs).
- [`docs/ROADMAP.md`](./docs/ROADMAP.md): Hitos de desarrollo del proyecto.
- [`AGENTS.md`](./AGENTS.md): Reglas permanentes para agentes de desarrollo.
