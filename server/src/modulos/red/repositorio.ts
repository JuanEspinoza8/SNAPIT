import type { PrismaClient } from '@prisma/client';
import type { PuntoInteresOsm } from './puntosInteres.js';

/**
 * Carga los puntos en `punto_interes` en una sola transacción. Si el osm_id ya está, actualiza esa fila
 * en vez de crear otra. Devuelve los osm_id que ya estaban antes de cargar y cuántos puntos de la base no
 * vinieron en esta carga, que no se borran.
 * Recibe el cliente de Prisma, como la semilla, porque el script crea el suyo después de leer el .env.
 */
export function guardarPuntosInteres(prisma: PrismaClient, puntos: PuntoInteresOsm[]) {
  // Los osm_id no entran en un int: van como texto y la base los convierte a bigint.
  const osmIds = puntos.map((p) => String(p.osmId));

  return prisma.$transaction(
    async (tx) => {
      const existentes = await tx.$queryRaw<{ osmId: bigint }[]>`
        SELECT osm_id AS "osmId" FROM punto_interes WHERE osm_id = ANY(${osmIds}::bigint[])`;

      // ST_MakePoint recibe primero la longitud y después la latitud.
      await tx.$executeRaw`
        INSERT INTO punto_interes (tipo, nombre, ubicacion, osm_id)
        SELECT p.tipo::tipo_punto_interes, p.nombre,
               ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326)::geography, p.osm_id
        FROM unnest(
          ${puntos.map((p) => p.tipo)}::text[],
          ${puntos.map((p) => p.nombre)}::text[],
          ${puntos.map((p) => p.lon)}::float8[],
          ${puntos.map((p) => p.lat)}::float8[],
          ${osmIds}::bigint[]
        ) AS p(tipo, nombre, lon, lat, osm_id)
        ON CONFLICT (osm_id) DO UPDATE
          SET tipo = EXCLUDED.tipo, nombre = EXCLUDED.nombre, ubicacion = EXCLUDED.ubicacion`;

      const [{ ausentes }] = await tx.$queryRaw<[{ ausentes: number }]>`
        SELECT count(*)::int AS ausentes FROM punto_interes
        WHERE osm_id IS NOT NULL AND osm_id <> ALL(${osmIds}::bigint[])`;

      return { yaEstaban: new Set(existentes.map((e) => Number(e.osmId))), ausentes };
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
}
