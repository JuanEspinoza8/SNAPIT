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
