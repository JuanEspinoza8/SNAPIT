# SnapIt
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

1. Copiar las variables de entorno:
   ```bash
   cp .env.example .env
   ```
   Si cambiás la clave, el usuario, la base o el puerto, cambialos también en `DATABASE_URL` y `TEST_DATABASE_URL`, que los repiten. La clave se fija la primera vez que se crea la base: si ya la levantaste, cambiarla en `.env` no alcanza y hay que empezar de cero con `docker compose down -v` (se borran los datos).
2. Levantar la base:
   ```bash
   docker compose up -d db
   ```
3. Esperar a que figure `(healthy)`:
   ```bash
   docker compose ps
   ```
4. Verificar PostGIS y pgRouting. La imagen los trae instalados, pero las extensiones las activa la migración inicial (`npx prisma migrate deploy` o el contenedor del servidor al arrancar, ver [Servidor](#servidor-server)). Después de correrla:
   ```bash
   docker compose exec db psql -U snapit -d snapit -c "SELECT postgis_version(), pgr_version();"
   ```
   Para probar la base sola, antes de la migración, se pueden activar a mano:
   ```bash
   docker compose exec db psql -U snapit -d snapit -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgrouting;"
   ```
   Los comandos usan el usuario y la base de `.env.example`; si los cambiaste, reemplazalos.

La base usa la imagen `pgrouting/pgrouting:16-3.5-3.8` (PostgreSQL 16 + PostGIS 3.5 + pgRouting 3.8) y guarda los datos en el volumen `db_data`. Solo acepta conexiones desde la misma PC. Para borrarla y empezar de cero: `docker compose down -v`.

## Servidor (`server/`)

Requisitos: Node 22 (ver `.nvmrc`) y la base levantada.

```bash
cd server
npm install                 # también genera el cliente de Prisma
npx prisma migrate deploy   # crea las tablas en la base de desarrollo
npm run dev                 # http://localhost:3000/api/salud
```

> **Nunca uses `prisma migrate dev` ni `prisma db push`.** El modelo está congelado y la única migración es `0_init`, que es `db/schema.sql` tal cual. `schema.prisma` no puede expresar los índices GIST ni los nombres de las restricciones, así que esos comandos generan una migración que borra los índices espaciales y renombra las claves del modelo entregado. Para aplicar migraciones, solo `prisma migrate deploy`.

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática |
| `npm test` | Tests con Vitest contra la base `snapit_test` (se crea sola) |
| `npm run lint` | ESLint |
| `npm run format` | Formatea con Prettier |
| `npm run build` / `npm start` | Compila a `dist/` y lo ejecuta |

Para levantar el servidor en Docker junto con la base: `docker compose up -d --build`. Al arrancar, el contenedor aplica las migraciones pendientes, así que no hace falta Node en la PC. El contenedor y `npm run dev` usan el mismo puerto: si uno está levantado, el otro no arranca y avisa que el puerto está ocupado.

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

## Cómo trabajamos

Ramas, commits y pull requests: ver [`CONTRIBUTING.md`](CONTRIBUTING.md).
