import { type EstadoIncidente, Prisma, type Severidad } from '@prisma/client';
import { contarUnos, distanciaHammingSql } from '../../compartido/hashPerceptual.js';
import {
  bitsDelHash,
  type DefinicionParametros,
  leerParametrosNumericos,
  noNegativo,
  positivo,
} from '../../compartido/parametros.js';
import { REPORTES_DEL_INCIDENTE } from '../incidentes/repositorio.js';
import {
  type Candidato,
  estadoSegunReportes,
  type ParametrosAgrupacion,
  type ReportesDelIncidente,
} from './calculo.js';

// Los mismos valores que carga la semilla: si falta un parámetro, se agrupa igual con estos. El radio y la
// ventana dividen en el puntaje, así que tienen que ser positivos; un peso en 0 apaga ese término.
const PARAMETROS: DefinicionParametros<keyof ParametrosAgrupacion> = {
  radioM: { clave: 'agrupacion.radio_m', valor: 30, valido: positivo },
  ventanaDias: { clave: 'agrupacion.ventana_dias', valor: 30, valido: positivo },
  pesoDistancia: { clave: 'agrupacion.peso_distancia', valor: 0.5, valido: noNegativo },
  pesoTiempo: { clave: 'agrupacion.peso_tiempo', valor: 0.2, valido: noNegativo },
  pesoFoto: { clave: 'agrupacion.peso_foto', valor: 0.3, valido: noNegativo },
  umbral: { clave: 'agrupacion.umbral', valor: 0.5, valido: noNegativo },
  unosMinimosHash: { clave: 'agrupacion.unos_minimos_hash', valor: 16, valido: bitsDelHash },
};

/** Los parámetros agrupacion.* de parametro_sistema. */
export function leerParametros(): Promise<ParametrosAgrupacion> {
  return leerParametrosNumericos(PARAMETROS);
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
 * El último reporte y la foto más parecida salen de los reportes válidos del incidente y de los que se
 * le unieron.
 */
export function buscarCandidatos(
  tx: Prisma.TransactionClient,
  datos: {
    categoriaId: number;
    lat: number;
    lon: number;
    hashPerceptual: string | null;
    radioM: number;
    unosMinimosHash: number;
  },
) {
  // ST_MakePoint recibe primero la longitud. Sobre geography, distancias y radio van en metros.
  const punto = Prisma.sql`ST_SetSRID(ST_MakePoint(${datos.lon}, ${datos.lat}), 4326)::geography`;
  // Una foto lisa u oscura no se compara: su hash se parece al de cualquier otra. Sin hash, la comparación
  // da NULL y el candidato queda sin parecido (hamming null).
  const comparable =
    datos.hashPerceptual !== null && contarUnos(datos.hashPerceptual) >= datos.unosMinimosHash;
  const hashNuevo = Prisma.sql`${comparable ? datos.hashPerceptual : null}::bit(64)`;
  const delCandidato = REPORTES_DEL_INCIDENTE(Prisma.sql`i.id`);
  return tx.$queryRaw<Candidato[]>`
    SELECT i.id AS "incidenteId",
           i.categoria_id AS "categoriaId",
           i.estado,
           i.incidente_principal_id AS "incidentePrincipalId",
           i.caducado_en AS "caducadoEn",
           i.vigente_hasta AS "vigenteHasta",
           ST_Distance(i.ubicacion, ${punto}) AS "distanciaM",
           (SELECT max(coalesce(r.sincronizado_en, r.registrado_en)) ${delCandidato}) AS "ultimoReporteEn",
           (SELECT min(${distanciaHammingSql(Prisma.sql`f.hash_perceptual`, hashNuevo)})::int
              FROM fotografia f
              JOIN (SELECT r.id ${delCandidato}) validos ON validos.id = f.reporte_id
             WHERE f.hash_perceptual IS NOT NULL
               AND bit_count(f.hash_perceptual) >= ${datos.unosMinimosHash}) AS hamming
    FROM incidente i
    WHERE i.categoria_id = ${datos.categoriaId}
      AND i.estado NOT IN ('RESUELTO', 'DESESTIMADO')
      AND i.incidente_principal_id IS NULL
      AND i.caducado_en IS NULL
      AND ST_DWithin(i.ubicacion, ${punto}, ${datos.radioM})`;
}

/** Las severidades que declararon los vecinos en el incidente y en los que se le unieron, sin desestimados. */
export async function severidadesDeclaradas(tx: Prisma.TransactionClient, incidenteId: number) {
  const filas = await tx.$queryRaw<{ severidad: Severidad }[]>`
    SELECT r.severidad_declarada::text AS severidad ${REPORTES_DEL_INCIDENTE(incidenteId)}`;
  return filas.map((fila) => fila.severidad);
}

/** Los reportes válidos y verificados del incidente, propios y de los que se le unieron. */
export async function contarReportes(tx: Prisma.TransactionClient, incidenteId: number) {
  const [fila] = await tx.$queryRaw<ReportesDelIncidente[]>`
    SELECT count(*)::int AS validos,
           count(*) FILTER (WHERE r.estado_verificacion = 'VERIFICADO')::int AS verificados
    ${REPORTES_DEL_INCIDENTE(incidenteId)}`;
  return fila!;
}

/**
 * Le pone al incidente el estado que dicen sus reportes (estadoSegunReportes), si cambió, y lo deja en la
 * bitácora como un cambio del sistema (sin usuario). Va dentro de la transacción de quien lo llama, con el
 * incidente ya bloqueado. Devuelve el estado con que queda.
 */
export async function recalcularEstado(tx: Prisma.TransactionClient, incidenteId: number, motivo: string) {
  const { estado } = await tx.incidente.findUniqueOrThrow({
    where: { id: incidenteId },
    select: { estado: true },
  });
  const nuevo: EstadoIncidente = estadoSegunReportes(estado, await contarReportes(tx, incidenteId));
  if (nuevo === estado) return estado;
  await tx.incidente.update({
    where: { id: incidenteId },
    data: { estado: nuevo, actualizadoEn: new Date() },
  });
  await tx.movimientoIncidente.create({
    data: {
      incidenteId,
      usuarioId: null,
      tipo: 'CAMBIO_ESTADO',
      estadoAnterior: estado,
      estadoNuevo: nuevo,
      comentario: motivo,
    },
  });
  return nuevo;
}
