import { Prisma, type Severidad } from '@prisma/client';
import { distanciaHammingSql } from '../../compartido/hashPerceptual.js';
import { type DefinicionParametros, leerParametrosNumericos } from '../../compartido/parametros.js';
import type { Candidato, ParametrosAgrupacion } from './calculo.js';

// Los mismos valores que carga la semilla: si falta un parámetro, se agrupa igual con estos.
const PARAMETROS: DefinicionParametros<keyof ParametrosAgrupacion> = {
  radioM: { clave: 'agrupacion.radio_m', valor: 30 },
  ventanaDias: { clave: 'agrupacion.ventana_dias', valor: 30 },
  pesoDistancia: { clave: 'agrupacion.peso_distancia', valor: 0.5 },
  pesoTiempo: { clave: 'agrupacion.peso_tiempo', valor: 0.2 },
  pesoFoto: { clave: 'agrupacion.peso_foto', valor: 0.3 },
  umbral: { clave: 'agrupacion.umbral', valor: 0.5 },
};

/** Los parámetros agrupacion.* de parametro_sistema. Todos tienen que ser positivos (radio, pesos, umbral). */
export function leerParametros(): Promise<ParametrosAgrupacion> {
  return leerParametrosNumericos(PARAMETROS, (valor) => valor > 0);
}

/**
 * Bloquea la agrupación de una categoría hasta que termine la transacción. Sin esto, dos reportes del mismo
 * bache que llegan a la vez podrían no verse entre sí y abrir dos incidentes.
 */
export function bloquearCategoria(tx: Prisma.TransactionClient, categoriaId: number) {
  // Prisma manda los números como bigint, y esta versión del lock pide dos integer.
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('agrupacion'), ${categoriaId}::int)`;
}

/**
 * Los incidentes de la categoría a menos del radio del punto, con la foto más parecida a la nueva.
 * Filtra lo que puede filtrar la base (cerrados, unidos, caducados); el resto lo decide calculo.ts.
 */
export function buscarCandidatos(
  tx: Prisma.TransactionClient,
  datos: { categoriaId: number; lat: number; lon: number; hashPerceptual: string | null; radioM: number },
) {
  // ST_MakePoint recibe primero la longitud. Sobre geography, distancias y radio van en metros.
  const punto = Prisma.sql`ST_SetSRID(ST_MakePoint(${datos.lon}, ${datos.lat}), 4326)::geography`;
  // Sin hash de la foto nueva, la comparación da NULL y el candidato queda sin parecido (hamming null).
  const hashNuevo = Prisma.sql`${datos.hashPerceptual}::bit(64)`;
  return tx.$queryRaw<Candidato[]>`
    SELECT i.id AS "incidenteId",
           i.categoria_id AS "categoriaId",
           i.estado,
           i.incidente_principal_id AS "incidentePrincipalId",
           i.caducado_en AS "caducadoEn",
           i.vigente_hasta AS "vigenteHasta",
           ST_Distance(i.ubicacion, ${punto}) AS "distanciaM",
           (SELECT max(r.registrado_en) FROM reporte r WHERE r.incidente_id = i.id) AS "ultimoReporteEn",
           (SELECT min(${distanciaHammingSql(Prisma.sql`f.hash_perceptual`, hashNuevo)})::int
              FROM fotografia f JOIN reporte r ON r.id = f.reporte_id
             WHERE r.incidente_id = i.id AND f.hash_perceptual IS NOT NULL) AS hamming
    FROM incidente i
    WHERE i.categoria_id = ${datos.categoriaId}
      AND i.estado NOT IN ('RESUELTO', 'DESESTIMADO')
      AND i.incidente_principal_id IS NULL
      AND i.caducado_en IS NULL
      AND ST_DWithin(i.ubicacion, ${punto}, ${datos.radioM})`;
}

/** Las severidades que declararon los vecinos en el incidente, sin los reportes desestimados. */
export async function severidadesDeclaradas(tx: Prisma.TransactionClient, incidenteId: number) {
  const filas = await tx.reporte.findMany({
    where: { incidenteId, estadoVerificacion: { not: 'DESESTIMADO' } },
    select: { severidadDeclarada: true },
  });
  return filas.map((fila) => fila.severidadDeclarada as Severidad);
}
