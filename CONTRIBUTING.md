# Cómo trabajamos

## Ramas

- Una rama por issue, desde `main` actualizado: `capa/N-descripcion-corta`.
- `capa` es la de la etiqueta de la issue: `server`, `web`, `mobile` o `infra`.
- Ejemplos: `infra/1-monorepo-docker`, `server/2-base-servidor`.

## Commits

- Una línea en español: `capa: qué se hizo`, en minúscula y sin punto final.
- En el cuerpo va la issue: `Refs #N`.
- Ejemplo: `server: base del servidor con Express, TypeScript y Prisma`.

## Base de datos

- El modelo está congelado: no se agregan, renombran ni borran tablas, columnas ni enums sin acordarlo con el grupo.
- La única migración es `server/prisma/migrations/0_init`, igual a `db/schema.sql`. No se crean migraciones nuevas.
- Solo `npx prisma migrate deploy`. Nunca `prisma migrate dev` ni `prisma db push`: generan una migración que borra los índices GIST y renombra las claves del modelo.

## Pull requests

- Título con el mismo formato que el commit: `capa: qué se hizo`.
- En la descripción: qué incluye, cómo probarlo y `Closes #N` para que se cierre la issue.
- Antes de pedir revisión, lint y tests en verde.
- `main` está protegida: no se pushea directo y cada PR necesita la aprobación de otro integrante antes de mergearse. Nadie mergea su propio PR sin esa aprobación.
