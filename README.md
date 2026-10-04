# Snap It
Reportes ciudadanos sobre la vía pública con verificación, priorización de incidentes y recorridos peatonales accesibles. Trabajo Final — TUDW, FaI UNCo 2026.

## Estructura

| Carpeta   | Contenido                                                       |
|-----------|-----------------------------------------------------------------|
| `server/` | API (Express + TypeScript + Prisma)                             |
| `web/`    | Panel web (React + Tailwind)                                    |
| `mobile/` | App (Flutter)                                                   |
| `db/`     | `schema.sql` y `DICCIONARIO.md` de la entrega del 19/09 (congelados) |
| `docs/`   | Documentación del proyecto                                      |

## Levantar la base de datos

Requisitos: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

1. Copiar las variables de entorno y, si se quiere, cambiar la clave:
   ```bash
   cp .env.example .env
   ```
2. Levantar la base:
   ```bash
   docker compose up -d db
   ```
3. Esperar a que figure `(healthy)`:
   ```bash
   docker compose ps
   ```
4. Verificar PostGIS y pgRouting:
   ```bash
   docker compose exec db psql -U snapit -d snapit -c "SELECT postgis_version(), pgr_version();"
   ```
   Si las funciones no existen, activar las extensiones (en uso normal lo hace la migración inicial de Prisma):
   ```bash
   docker compose exec db psql -U snapit -d snapit -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgrouting;"
   ```

La base usa la imagen `pgrouting/pgrouting:16-3.5-3.8` (PostgreSQL 16 + PostGIS 3.5 + pgRouting 3.8) y guarda los datos en el volumen `db_data`. Para borrarla y empezar de cero: `docker compose down -v`.

## Servidor (`server/`)

Requisitos: Node 22 (ver `.nvmrc`) y la base levantada.

```bash
cd server
npm install                 # también genera el cliente de Prisma
npx prisma migrate deploy   # crea las tablas en la base de desarrollo
npm run dev                 # http://localhost:3000/api/salud
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática |
| `npm test` | Tests con Vitest contra la base `snapit_test` (se crea sola) |
| `npm run lint` | ESLint |
| `npm run format` | Formatea con Prettier |
| `npm run build` / `npm start` | Compila a `dist/` y lo ejecuta |

Para levantar el servidor en Docker junto con la base: `docker compose up -d --build`.

### Estructura

```
src/
  config/        env (validado con zod) y logger
  compartido/    prisma, errores y middlewares comunes
  modulos/
    <modulo>/
      rutas.ts        endpoints y validación de la entrada
      controlador.ts  traduce la petición HTTP a llamadas al servicio
      servicio.ts     reglas de negocio
      repositorio.ts  acceso a la base (Prisma / SQL)
      calculo.ts      funciones puras (puntajes, distancias), fáciles de testear
```

Cada módulo crea solo los archivos que necesita. Las convenciones de la API están en [`docs/api.md`](docs/api.md).
