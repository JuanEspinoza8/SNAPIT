import type { PrismaClient, TipoTramo } from '@prisma/client';
import type { PuntoInteresOsm } from './puntosInteres.js';
import type { Anillo, NodoRed, TramoRed } from './redPeatonal.js';

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

export interface ZonaPiloto {
  id: number;
  nombre: string;
  geometria: { type: 'Polygon'; coordinates: Anillo[] };
}

/** Las zonas piloto activas, con el polígono en GeoJSON. */
export async function listarZonasActivas(prisma: PrismaClient): Promise<ZonaPiloto[]> {
  const filas = await prisma.$queryRaw<{ id: number; nombre: string; geometria: string }[]>`
    SELECT id, nombre, ST_AsGeoJSON(geometria) AS geometria FROM zona_piloto WHERE activa ORDER BY id`;
  return filas.map((fila) => ({ ...fila, geometria: JSON.parse(fila.geometria) }));
}

export interface CargaRed {
  nodos: number;
  tramos: number;
  porTipo: Record<TipoTramo, number>;
  conRampa: number;
  conSemaforoSonoro: number;
  conPisoPodotactil: number;
  /** Tramos de la respuesta que no tocan ninguna zona piloto activa. No se cargan. */
  fueraDeZona: number;
  /** Filas de `incidente_tramo` que se vaciaron con la recarga. */
  vinculosBorrados: number;
  /** Del más grande al más chico, con un nodo de cada uno para ubicarlo en OSM. */
  componentes: { nodos: number; nodoOsmId: number }[];
}

// Los null van como texto vacío: unnest los recibe como text[] y NULLIF los vuelve null.
const comoTexto = (valor: number | string | null) => (valor === null ? '' : String(valor));

/**
 * Reemplaza toda la red por la que se pasa, en una sola transacción: si algo falla, queda la anterior.
 * Carga solo los tramos que tocan alguna zona piloto activa (y sus nodos), calcula `longitud_metros` y
 * `costo_base` con ST_Length sobre geography y cuenta los componentes conexos con pgRouting.
 */
export function reemplazarRed(
  prisma: PrismaClient,
  { nodos, tramos }: { nodos: NodoRed[]; tramos: TramoRed[] },
) {
  return prisma.$transaction(
    async (tx): Promise<CargaRed> => {
      const [{ vinculos }] = await tx.$queryRaw<[{ vinculos: number }]>`
        SELECT count(*)::int AS vinculos FROM incidente_tramo`;

      // La red es una copia de OSM, no un dato que cargue alguien: se reemplaza entera. RESTART IDENTITY
      // hace que la misma respuesta dé los mismos id, y CASCADE vacía también incidente_tramo.
      await tx.$executeRaw`TRUNCATE tramo_peatonal, nodo_peatonal RESTART IDENTITY CASCADE`;

      await tx.$executeRaw`
        CREATE TEMP TABLE tramo_candidato (
          orden int, origen bigint, destino bigint, geometria geography(LineString, 4326), tipo tipo_tramo,
          tiene_rampa boolean, pendiente numeric(5, 2), ancho numeric(4, 2), superficie varchar(40)
        ) ON COMMIT DROP`;
      await tx.$executeRaw`
        INSERT INTO tramo_candidato
        SELECT t.orden, t.origen, t.destino, ST_GeomFromText(t.wkt, 4326)::geography, t.tipo::tipo_tramo,
               t.rampa, NULLIF(t.pendiente, '')::numeric, NULLIF(t.ancho, '')::numeric, NULLIF(t.superficie, '')
        FROM unnest(
          ${tramos.map((t) => String(t.nodoOrigen))}::bigint[],
          ${tramos.map((t) => String(t.nodoDestino))}::bigint[],
          ${tramos.map((t) => `LINESTRING(${t.puntos.map(([lon, lat]) => `${lon} ${lat}`).join(', ')})`)}::text[],
          ${tramos.map((t) => t.tipo)}::text[],
          ${tramos.map((t) => t.tieneRampa)}::boolean[],
          ${tramos.map((t) => comoTexto(t.pendientePorcentaje))}::text[],
          ${tramos.map((t) => comoTexto(t.anchoEstimado))}::text[],
          ${tramos.map((t) => comoTexto(t.superficie))}::text[]
        ) WITH ORDINALITY AS t(origen, destino, wkt, tipo, rampa, pendiente, ancho, superficie, orden)`;

      const fueraDeZona = await tx.$executeRaw`
        DELETE FROM tramo_candidato t
        WHERE NOT EXISTS (
          SELECT 1 FROM zona_piloto z WHERE z.activa AND ST_Intersects(z.geometria, t.geometria)
        )`;
      if (fueraDeZona === tramos.length) {
        throw new Error(
          'Ningún tramo de la respuesta toca una zona piloto activa. Si cambiaste el polígono, descargá la red de nuevo.',
        );
      }

      // ST_MakePoint recibe primero la longitud y después la latitud.
      const cantidadNodos = await tx.$executeRaw`
        INSERT INTO nodo_peatonal (osm_id, ubicacion, tiene_semaforo_sonoro, tiene_piso_podotactil)
        SELECT n.osm_id, ST_SetSRID(ST_MakePoint(n.lon, n.lat), 4326)::geography, n.sonoro, n.podotactil
        FROM unnest(
          ${nodos.map((n) => String(n.osmId))}::bigint[],
          ${nodos.map((n) => n.lon)}::float8[],
          ${nodos.map((n) => n.lat)}::float8[],
          ${nodos.map((n) => n.tieneSemaforoSonoro)}::boolean[],
          ${nodos.map((n) => n.tienePisoPodotactil)}::boolean[]
        ) AS n(osm_id, lon, lat, sonoro, podotactil)
        WHERE n.osm_id IN (SELECT origen FROM tramo_candidato UNION SELECT destino FROM tramo_candidato)
        ORDER BY n.osm_id`;

      const cantidadTramos = await tx.$executeRaw`
        INSERT INTO tramo_peatonal (nodo_origen_id, nodo_destino_id, geometria, longitud_metros, tipo, tiene_rampa,
                                    pendiente_porcentaje, ancho_estimado, superficie, costo_base)
        SELECT o.id, d.id, t.geometria, l.metros, t.tipo, t.tiene_rampa, t.pendiente, t.ancho, t.superficie, l.metros
        FROM tramo_candidato t
        JOIN nodo_peatonal o ON o.osm_id = t.origen
        JOIN nodo_peatonal d ON d.osm_id = t.destino
        CROSS JOIN LATERAL (SELECT round(ST_Length(t.geometria)::numeric, 2) AS metros) l
        ORDER BY t.orden`;

      const tipos = await tx.$queryRaw<{ tipo: TipoTramo; cantidad: number }[]>`
        SELECT tipo::text AS tipo, count(*)::int AS cantidad FROM tramo_peatonal GROUP BY tipo`;
      const [atributos] = await tx.$queryRaw<
        [{ conRampa: number; conSemaforoSonoro: number; conPisoPodotactil: number }]
      >`
        SELECT (SELECT count(*)::int FROM tramo_peatonal WHERE tiene_rampa) AS "conRampa",
               (SELECT count(*)::int FROM nodo_peatonal WHERE tiene_semaforo_sonoro) AS "conSemaforoSonoro",
               (SELECT count(*)::int FROM nodo_peatonal WHERE tiene_piso_podotactil) AS "conPisoPodotactil"`;
      const componentes = await tx.$queryRaw<{ nodos: number; nodoOsmId: bigint }[]>`
        SELECT count(*)::int AS nodos, min(n.osm_id) AS "nodoOsmId"
        FROM pgr_connectedComponents('SELECT id, source, target, cost, reverse_cost FROM red_peatonal') c
        JOIN nodo_peatonal n ON n.id = c.node
        GROUP BY c.component
        ORDER BY nodos DESC, "nodoOsmId"`;

      const porTipo: Record<TipoTramo, number> = { VEREDA: 0, CRUCE: 0, ESCALERA: 0, SENDA: 0 };
      for (const { tipo, cantidad } of tipos) porTipo[tipo] = cantidad;

      return {
        nodos: cantidadNodos,
        tramos: cantidadTramos,
        porTipo,
        ...atributos,
        fueraDeZona,
        vinculosBorrados: vinculos,
        componentes: componentes.map((c) => ({ nodos: c.nodos, nodoOsmId: Number(c.nodoOsmId) })),
      };
    },
    { maxWait: 15_000, timeout: 120_000 },
  );
}
