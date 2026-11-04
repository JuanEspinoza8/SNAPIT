import { Prisma } from '@prisma/client';
import { logger } from '../../config/logger.js';
import { type DefinicionParametros, leerParametrosNumericos, positivo } from '../../compartido/parametros.js';
import { prisma } from '../../compartido/prisma.js';
import { INCIDENTE_VISIBLE } from '../incidentes/repositorio.js';
import {
  claveRegla,
  leerEfecto,
  type ParametrosRecorrido,
  REGLAS_TRAMO,
  type ReglasPerfil,
  type TramoParaCosto,
} from './calculo.js';
import type { Punto } from './esquemas.js';

// Los mismos valores que carga la semilla.
const PARAMETROS: DefinicionParametros<keyof ParametrosRecorrido> = {
  distanciaMaxAlNodoM: { clave: 'ruteo.distancia_max_al_nodo_m', valor: 100, valido: positivo },
  velocidadMPorMin: { clave: 'ruteo.velocidad_m_por_min', valor: 50, valido: positivo },
  pendienteMaxPorcentaje: { clave: 'ruteo.pendiente_max_porcentaje', valor: 8, valido: positivo },
  anchoMinM: { clave: 'ruteo.ancho_min_m', valor: 0.9, valido: positivo },
};

export const leerParametros = () => leerParametrosNumericos(PARAMETROS);

/**
 * Cómo pesa cada atributo del tramo para el perfil, de parametro_sistema (ruteo.<regla>.perfil_<id>). Una regla
 * sin clave no le cambia el costo: así un perfil nuevo no tiene reglas hasta que se le cargan.
 */
export async function leerReglasPerfil(perfilId: number): Promise<ReglasPerfil> {
  const claves = REGLAS_TRAMO.map((regla) => claveRegla(regla, perfilId));
  const filas = await prisma.parametroSistema.findMany({ where: { clave: { in: claves } } });
  const valores = new Map(filas.map((fila) => [fila.clave, fila.valor]));

  const reglas: ReglasPerfil = {};
  for (const regla of REGLAS_TRAMO) {
    const clave = claveRegla(regla, perfilId);
    const valor = valores.get(clave);
    if (valor === undefined) continue;
    const efecto = leerEfecto(valor);
    if (efecto === null) {
      logger.warn('El parámetro %s no es un factor mayor que 0 ni "intransitable": no se aplica', clave);
      continue;
    }
    reglas[regla] = efecto;
  }
  return reglas;
}

export function perfilActivo(perfilId: number) {
  return prisma.perfilMovilidad.findFirst({ where: { id: perfilId, activo: true }, select: { id: true } });
}

// ST_MakePoint recibe primero la longitud y después la latitud.
const comoGeography = ({ lat, lon }: Punto) =>
  Prisma.sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;

/** Si cada punto está dentro de alguna zona piloto activa. */
export async function dentroDeZona(origen: Punto, destino: Punto) {
  const enZona = (punto: Punto) => Prisma.sql`
    EXISTS (SELECT 1 FROM zona_piloto z WHERE z.activa AND ST_Covers(z.geometria, ${comoGeography(punto)}))`;
  const [resultado] = await prisma.$queryRaw<[{ origen: boolean; destino: boolean }]>`
    SELECT ${enZona(origen)} AS origen, ${enZona(destino)} AS destino`;
  return resultado;
}

/** El nodo de la red más cercano al punto, si hay uno a no más de `distanciaMaxM` metros. */
export async function nodoCercano(punto: Punto, distanciaMaxM: number): Promise<bigint | null> {
  const lugar = comoGeography(punto);
  const filas = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT n.id FROM nodo_peatonal n
    WHERE ST_DWithin(n.ubicacion, ${lugar}, ${distanciaMaxM})
    ORDER BY n.ubicacion <-> ${lugar}, n.id
    LIMIT 1`;
  return filas[0]?.id ?? null;
}

/** Un incidente que cuenta para el recorrido: el que se ve en el mapa, salvo los resueltos. Va con el alias `i`. */
const INCIDENTE_VIGENTE = Prisma.sql`${INCIDENTE_VISIBLE} AND i.estado <> 'RESUELTO'`;

export interface TramoDeLaRed extends TramoParaCosto {
  id: bigint;
  source: bigint;
  target: bigint;
}

/**
 * Todos los tramos de red_peatonal con lo que hace falta para calcular su costo con ese perfil: sus atributos,
 * si sus extremos tienen semáforo sonoro o piso podotáctil y cómo le afecta al perfil cada incidente vigente
 * que lo obstruye (categoria_perfil). Un incidente de una categoría sin fila para el perfil no le cambia nada.
 */
export function tramosDelPerfil(perfilId: number) {
  return prisma.$queryRaw<TramoDeLaRed[]>`
    SELECT r.id, r.source, r.target, r.cost::float8 AS "costoBase", t.tipo::text AS tipo,
           t.tiene_rampa AS "tieneRampa", t.pendiente_porcentaje::float8 AS "pendientePorcentaje",
           t.ancho_estimado::float8 AS "anchoEstimado", t.superficie,
           (o.tiene_semaforo_sonoro OR o.tiene_piso_podotactil
            OR d.tiene_semaforo_sonoro OR d.tiene_piso_podotactil) AS "extremoConSenal",
           coalesce(v.efectos, '[]'::json) AS incidentes
    FROM red_peatonal r
    JOIN tramo_peatonal t ON t.id = r.id
    JOIN nodo_peatonal o ON o.id = t.nodo_origen_id
    JOIN nodo_peatonal d ON d.id = t.nodo_destino_id
    LEFT JOIN (
      SELECT it.tramo_peatonal_id,
             json_agg(CASE WHEN cp.intransitable THEN to_json('intransitable'::text)
                           ELSE to_json(cp.factor_penalizacion::float8) END) AS efectos
      FROM incidente_tramo it
      JOIN incidente i ON i.id = it.incidente_id
      JOIN categoria_perfil cp ON cp.categoria_id = i.categoria_id AND cp.perfil_movilidad_id = ${perfilId}
      WHERE ${INCIDENTE_VIGENTE}
      GROUP BY it.tramo_peatonal_id
    ) v ON v.tramo_peatonal_id = r.id`;
}

export interface Camino {
  distanciaMetros: number;
  geometria: { type: 'LineString'; coordinates: [number, number][] };
}

/**
 * El camino de menor costo entre los dos nodos (pgr_dijkstra), con los costos ya calculados para el perfil.
 * Un costo null es un tramo intransitable: va con -1, que pgRouting ignora. Devuelve null si no hay camino.
 */
export function caminoMasBarato(
  costos: { id: bigint; source: bigint; target: bigint; costo: number | null }[],
  origen: bigint,
  destino: bigint,
) {
  // pgr_dijkstra recibe la red como el texto de una consulta: los costos van a una tabla temporal y así ningún
  // dato se arma dentro de ese texto. La tabla vive solo en esta transacción.
  return prisma.$transaction(async (tx): Promise<Camino | null> => {
    await tx.$executeRaw`
      CREATE TEMP TABLE costo_tramo (id bigint, source bigint, target bigint, cost float8, reverse_cost float8)
      ON COMMIT DROP`;
    await tx.$executeRaw`
      INSERT INTO costo_tramo
      SELECT c.id, c.source, c.target, c.costo, c.costo
      FROM unnest(
        ${costos.map((c) => String(c.id))}::bigint[],
        ${costos.map((c) => String(c.source))}::bigint[],
        ${costos.map((c) => String(c.target))}::bigint[],
        ${costos.map((c) => c.costo ?? -1)}::float8[]
      ) AS c(id, source, target, costo)`;

    // Cada fila del resultado dice desde qué nodo se entra al tramo: si es su destino, se recorre al revés.
    const [camino] = await tx.$queryRaw<
      [{ tramos: number; distancia: number | null; geometria: string | null }]
    >`
      WITH pasos AS (
        SELECT p.seq, t.longitud_metros,
               CASE WHEN p.node = t.nodo_origen_id THEN t.geometria::geometry
                    ELSE ST_Reverse(t.geometria::geometry) END AS traza
        FROM pgr_dijkstra(
          'SELECT id, source, target, cost, reverse_cost FROM costo_tramo', ${origen}::bigint, ${destino}::bigint
        ) p
        JOIN tramo_peatonal t ON t.id = p.edge
      )
      SELECT count(*)::int AS tramos, sum(longitud_metros)::float8 AS distancia,
             ST_AsGeoJSON(ST_MakeLine(traza ORDER BY seq), 6) AS geometria
      FROM pasos`;

    if (camino.tramos === 0) return null;
    return { distanciaMetros: camino.distancia!, geometria: JSON.parse(camino.geometria!) };
  });
}
