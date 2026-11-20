import { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { SIN_BARRIO } from '../geocodificacion/calculo.js';
import type { Filtros, PedidoFeed } from './esquemas.js';

/**
 * Si el reporte con el alias `r` está marcado para desestimar: la IA dijo que su foto no muestra un problema de la
 * vía pública y espera que un operador lo confirme (ia/cola.ts). Sigue PENDIENTE_REVISION, pero su último paso en
 * el log de la IA es REVISION_MANUAL con esa respuesta. Mientras espera no se muestra en público: ni su foto, ni
 * su incidente si no tiene otro reporte que se vea.
 */
export const MARCADO_PARA_DESESTIMAR = (r: Prisma.Sql = Prisma.raw('r')) => Prisma.sql`(
  ${r}.estado_verificacion = 'PENDIENTE_REVISION'
  AND coalesce((
    SELECT e.estado = 'REVISION_MANUAL' AND ri.salida->>'esProblemaViaPublica' = 'false'
    FROM evento_verificacion_ia e
    LEFT JOIN registro_ia ri ON ri.id = e.registro_ia_id
    WHERE e.reporte_id = ${r}.id
    ORDER BY e.id DESC
    LIMIT 1
  ), false))`;

/**
 * Lo que se ve en el mapa público: ni desestimados, ni caducados, ni los unidos a otro incidente.
 * Un temporal cuya vigencia ya pasó cuenta como caducado aunque todavía no se haya marcado. Tampoco uno que tiene
 * reportes marcados para desestimar (MARCADO_PARA_DESESTIMAR) y ninguno más que se vea: los eliminados por su autor
 * no cuentan. Uno sin reportes sí se ve.
 * Va con el alias `i`. La usan también las fotos públicas (reportes/repositorio.ts).
 */
export const INCIDENTE_VISIBLE = Prisma.sql`
  i.estado <> 'DESESTIMADO'
  AND i.caducado_en IS NULL
  AND i.incidente_principal_id IS NULL
  AND (i.vigente_hasta IS NULL OR i.vigente_hasta > now())
  AND NOT (
    EXISTS (SELECT 1 FROM reporte rm JOIN incidente im ON im.id = rm.incidente_id
            WHERE (im.id = i.id OR im.incidente_principal_id = i.id)
              AND ${MARCADO_PARA_DESESTIMAR(Prisma.raw('rm'))})
    AND NOT EXISTS (SELECT 1 FROM reporte rv JOIN incidente iv ON iv.id = rv.incidente_id
                    WHERE (iv.id = i.id OR iv.incidente_principal_id = i.id)
                      AND rv.estado_verificacion <> 'DESESTIMADO'
                      AND rv.eliminado_en IS NULL
                      AND NOT ${MARCADO_PARA_DESESTIMAR(Prisma.raw('rv'))})
  )`;

/**
 * Los que la tarea diaria tiene que caducar (F12, #155): temporales vencidos, todavía sin marcar, que no están
 * resueltos, desestimados ni unidos a otro. Un permanente nunca caduca, aunque tenga una fecha cargada.
 * Va con el alias `i`.
 */
export const POR_CADUCAR = Prisma.sql`
  i.caducado_en IS NULL
  AND i.tipo_vigencia = 'TEMPORAL'
  AND i.vigente_hasta <= now()
  AND i.estado NOT IN ('RESUELTO', 'DESESTIMADO')
  AND i.incidente_principal_id IS NULL`;

/**
 * Cuándo caducó el incidente: la marca de la tarea diaria o, si todavía no corrió, cuándo venció. Null si no
 * caducó, si se resolvió o desestimó antes de vencer, o si no hay incidente. Va con el alias `i`.
 */
export const CADUCO_EN = Prisma.sql`
  CASE WHEN i.caducado_en IS NOT NULL THEN i.caducado_en
       WHEN ${POR_CADUCAR} THEN i.vigente_hasta
  END`;

/**
 * El barrio del incidente, con la misma regla que extraerBarrio() (geocodificacion/calculo.ts): lo que
 * está después de la última coma de la dirección, o la dirección entera si no tiene coma. Null mientras
 * la dirección no se completó. Va con el alias `i`.
 */
export const BARRIO = Prisma.sql`
  CASE WHEN i.direccion IS NOT NULL
       THEN coalesce(nullif(btrim(substring(i.direccion from '[^,]*$')), ''), ${SIN_BARRIO})
  END`;

/**
 * El área que le corresponde a un incidente publicado: la que le asignó el operador al derivarlo o, si todavía no
 * lo derivó, la de su categoría. Mientras está en revisión es null. Va con los alias `i` (incidente) y `c` (su
 * categoría).
 */
export const DERIVADO_A = Prisma.sql`
  CASE WHEN i.estado = 'REGISTRADO' THEN NULL
       ELSE (SELECT json_build_object('id', a.id, 'nombre', a.nombre)
             FROM area a WHERE a.id = coalesce(i.area_id, c.area_id))
  END`;

export interface PuntoMapa {
  id: number;
  lat: number;
  lon: number;
  categoriaId: number;
  categoriaNombre: string;
  estado: string;
  enRevision: boolean;
  primerReporteEn: Date;
  cantidadReportes: number;
}

// Lo que pueden filtrar el mapa y el feed, siempre sobre lo visible.
export function condicionesDe(filtros: Filtros) {
  const condiciones = [INCIDENTE_VISIBLE];
  if (filtros.categoriaId) condiciones.push(Prisma.sql`i.categoria_id = ${filtros.categoriaId}`);
  if (filtros.estado) condiciones.push(Prisma.sql`i.estado = ${filtros.estado}::estado_incidente`);
  if (filtros.desde) condiciones.push(Prisma.sql`i.primer_reporte_en >= ${filtros.desde}`);
  if (filtros.hasta) condiciones.push(Prisma.sql`i.primer_reporte_en <= ${filtros.hasta}`);
  if (filtros.barrio) condiciones.push(Prisma.sql`${BARRIO} = ${filtros.barrio}`);
  if (filtros.bbox) {
    const { oeste, sur, este, norte } = filtros.bbox;
    const rectangulo = Prisma.sql`ST_MakeEnvelope(${oeste}, ${sur}, ${este}, ${norte}, 4326)`;
    // Sobre geography, && compara cajas en 3D: usa el índice GIST pero deja pasar puntos de afuera.
    // ST_Intersects sobre geometry descarta esos puntos contra el mismo rectángulo que muestra el mapa.
    condiciones.push(
      Prisma.sql`i.ubicacion && ${rectangulo}::geography AND ST_Intersects(i.ubicacion::geometry, ${rectangulo})`,
    );
  }
  return condiciones;
}

export function listarVisibles(filtros: Filtros) {
  const condiciones = condicionesDe(filtros);
  return prisma.$queryRaw<PuntoMapa[]>`
    SELECT i.id,
           ST_Y(i.ubicacion::geometry) AS lat,
           ST_X(i.ubicacion::geometry) AS lon,
           i.categoria_id AS "categoriaId",
           c.nombre AS "categoriaNombre",
           i.estado::text AS estado,
           i.estado = 'REGISTRADO' AS "enRevision",
           i.primer_reporte_en AS "primerReporteEn",
           i.cantidad_reportes AS "cantidadReportes"
    FROM incidente i
    JOIN categoria c ON c.id = i.categoria_id
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY i.primer_reporte_en DESC, i.id DESC`;
}

/** Cuántas fotos trae cada tarjeta del feed: alcanzan para el carrusel, el resto se ve en la ficha. */
export const FOTOS_POR_TARJETA = 5;

export interface TarjetaFeed extends PuntoMapa {
  severidad: string;
  derivadoA: { id: number; nombre: string } | null;
  direccion: string | null;
  resueltoEn: Date | null;
  cursorMicrosegundos: bigint;
  cantidadVecinos: bigint;
  fotoIds: number[];
  cantidadFotos: bigint;
  cantidadMeGusta: bigint;
  cantidadComentarios: bigint;
}

/**
 * Una página del feed, del más nuevo al más viejo, con el mismo orden que el mapa. Pagina por cursor
 * (fecha del primer reporte e id) y no por desplazamiento: si entra un incidente nuevo mientras alguien
 * scrollea, la página siguiente no repite el último. Trae uno de más para saber si hay otra página.
 */
export function listarFeed(pedido: PedidoFeed) {
  const condiciones = condicionesDe(pedido);
  if (pedido.cursor) {
    condiciones.push(
      Prisma.sql`(i.primer_reporte_en, i.id) <
        (to_timestamp(0) + ${pedido.cursor.microsegundos}::bigint * interval '1 microsecond', ${pedido.cursor.id}::int)`,
    );
  }
  const reportes = REPORTES_VISIBLES_DEL_INCIDENTE(Prisma.sql`i.id`);

  return prisma.$queryRaw<TarjetaFeed[]>`
    SELECT i.id,
           ST_Y(i.ubicacion::geometry) AS lat,
           ST_X(i.ubicacion::geometry) AS lon,
           i.categoria_id AS "categoriaId",
           c.nombre AS "categoriaNombre",
           i.estado::text AS estado,
           i.estado = 'REGISTRADO' AS "enRevision",
           i.severidad::text AS severidad,
           i.primer_reporte_en AS "primerReporteEn",
           (extract(epoch FROM i.primer_reporte_en) * 1000000)::bigint AS "cursorMicrosegundos",
           i.cantidad_reportes AS "cantidadReportes",
           i.direccion,
           i.resuelto_en AS "resueltoEn",
           ${DERIVADO_A} AS "derivadoA",
           vecinos.cantidad AS "cantidadVecinos",
           coalesce(fotos.ids, '{}') AS "fotoIds",
           fotos.total AS "cantidadFotos",
           likes.total AS "cantidadMeGusta",
           comentarios.total AS "cantidadComentarios"
    FROM incidente i
    JOIN categoria c ON c.id = i.categoria_id
    CROSS JOIN LATERAL (SELECT count(DISTINCT r.usuario_id) AS cantidad ${reportes}) vecinos
    CROSS JOIN LATERAL (
      SELECT (array_agg(f.id ORDER BY f.id))[1:${FOTOS_POR_TARJETA}] AS ids, count(*) AS total
      FROM fotografia f
      JOIN (SELECT r.id ${reportes}) validos ON validos.id = f.reporte_id
    ) fotos
    -- Lo social suma todos sus reportes: el de cada foto se ve en el detalle.
    CROSS JOIN LATERAL (
      SELECT count(*) AS total
      FROM me_gusta_reporte m
      JOIN (SELECT r.id ${reportes}) validos ON validos.id = m.reporte_id
    ) likes
    -- Los de sus fotos más los del incidente y de los unidos. Dos cuentas por separado, cada una por su
    -- índice: juntas en un OR, la base recorría toda la tabla comentario por cada tarjeta.
    CROSS JOIN LATERAL (
      SELECT (
        SELECT count(*)
        FROM comentario c
        JOIN (SELECT r.id ${reportes}) validos ON validos.id = c.reporte_id
        WHERE c.eliminado_en IS NULL
      ) + (
        SELECT count(*)
        FROM comentario c
        JOIN incidente comentado ON comentado.id = c.incidente_id
        WHERE (comentado.id = i.id OR comentado.incidente_principal_id = i.id) AND c.eliminado_en IS NULL
      ) AS total
    ) comentarios
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY i.primer_reporte_en DESC, i.id DESC
    LIMIT ${pedido.limite + 1}`;
}

export function buscarPrincipal(id: number) {
  return prisma.incidente.findUnique({ where: { id }, select: { id: true, incidentePrincipalId: true } });
}

export async function buscarVisible(id: number) {
  const [incidente] = await prisma.$queryRaw<
    (PuntoMapa & {
      severidad: string;
      direccion: string | null;
      resueltoEn: Date | null;
      derivadoA: { id: number; nombre: string } | null;
    })[]
  >`
    SELECT i.id,
           ST_Y(i.ubicacion::geometry) AS lat,
           ST_X(i.ubicacion::geometry) AS lon,
           i.categoria_id AS "categoriaId",
           c.nombre AS "categoriaNombre",
           i.estado::text AS estado,
           i.estado = 'REGISTRADO' AS "enRevision",
           i.severidad::text AS severidad,
           i.primer_reporte_en AS "primerReporteEn",
           i.cantidad_reportes AS "cantidadReportes",
           i.direccion,
           i.resuelto_en AS "resueltoEn",
           ${DERIVADO_A} AS "derivadoA"
    FROM incidente i
    JOIN categoria c ON c.id = i.categoria_id
    WHERE i.id = ${id} AND ${INCIDENTE_VISIBLE}`;
  return incidente;
}

/**
 * Reportes válidos del incidente y de los que se le unieron: de ahí salen, en la agrupación, la severidad, el
 * último reporte y la foto más parecida. Alcanza con un nivel: un incidente que tiene unidos no se puede unir a
 * otro, así que no hay cadenas. Los desestimados no cuentan. Los que su autor eliminó siguen contando para agrupar
 * (#150); para el estado y la severidad no cuentan (agrupacion/repositorio.ts). Para mostrar, se usa
 * REPORTES_VISIBLES_DEL_INCIDENTE.
 * `id` puede ser un número o una columna de la consulta de afuera (por ejemplo, Prisma.sql`i.id`); los
 * reportes quedan con el alias `r`.
 */
export const REPORTES_DEL_INCIDENTE = (id: number | Prisma.Sql) => Prisma.sql`
  FROM reporte r
  JOIN incidente del_incidente ON del_incidente.id = r.incidente_id
  WHERE (del_incidente.id = ${id} OR del_incidente.incidente_principal_id = ${id})
    AND r.estado_verificacion <> 'DESESTIMADO'`;

/**
 * Los reportes que ve el público: los de REPORTES_DEL_INCIDENTE menos los que su autor eliminó y los marcados
 * para desestimar. De acá salen las fotos, los vecinos y lo social de la ficha y del feed.
 */
export const REPORTES_VISIBLES_DEL_INCIDENTE = (id: number | Prisma.Sql) => Prisma.sql`
  ${REPORTES_DEL_INCIDENTE(id)}
    AND r.eliminado_en IS NULL
    AND NOT ${MARCADO_PARA_DESESTIMAR()}`;

export async function contarVecinos(id: number) {
  // count() de PostgreSQL llega como bigint: se pasa a número para el JSON.
  const [fila] = await prisma.$queryRaw<{ cantidad: bigint }[]>`
    SELECT count(DISTINCT r.usuario_id) AS cantidad ${REPORTES_VISIBLES_DEL_INCIDENTE(id)}`;
  return Number(fila?.cantidad ?? 0);
}

// --- Confirmaciones (F12, #154) ---

/**
 * Las confirmaciones del incidente y de los que se le unieron: quien confirmó el duplicado confirmó el mismo
 * problema, como pasa con los seguimientos. Quedan con el alias `c`. La usa también la prioridad.
 */
export const CONFIRMACIONES_DEL_INCIDENTE = (id: number) => Prisma.sql`
  FROM confirmacion_incidente c
  JOIN incidente confirmado ON confirmado.id = c.incidente_id
  WHERE (confirmado.id = ${id} OR confirmado.incidente_principal_id = ${id})`;

/** Vecinos distintos que confirmaron el incidente o uno de sus unidos: el contador de la ficha. */
export async function contarConfirmaciones(id: number, cliente: Prisma.TransactionClient = prisma) {
  const [fila] = await cliente.$queryRaw<{ cantidad: bigint }[]>`
    SELECT count(DISTINCT c.usuario_id) AS cantidad ${CONFIRMACIONES_DEL_INCIDENTE(id)}`;
  return Number(fila?.cantidad ?? 0);
}

export async function yaConfirmo(usuarioId: number, id: number, cliente: Prisma.TransactionClient = prisma) {
  const [fila] = await cliente.$queryRaw<{ confirmo: boolean }[]>`
    SELECT EXISTS (SELECT 1 ${CONFIRMACIONES_DEL_INCIDENTE(id)} AND c.usuario_id = ${usuarioId}) AS confirmo`;
  return fila?.confirmo ?? false;
}

export function insertarConfirmacion(tx: Prisma.TransactionClient, incidenteId: number, usuarioId: number) {
  return tx.confirmacionIncidente.create({ data: { incidenteId, usuarioId } });
}

// --- Caducidad (F12, #155) ---

/** Los incidentes que la tarea diaria tiene que caducar. */
export async function listarVencidos() {
  const filas = await prisma.$queryRaw<{ id: number }[]>`
    SELECT i.id FROM incidente i WHERE ${POR_CADUCAR} ORDER BY i.id`;
  return filas.map((fila) => fila.id);
}

/**
 * Marca el incidente como caducado, con la fecha en que venció. El UPDATE vuelve a mirar el criterio: si entre la
 * lista y su turno se cerró, se unió a otro o ya lo marcó otra corrida, no cambia nada y devuelve false.
 */
export async function marcarCaducado(tx: Prisma.TransactionClient, id: number) {
  const marcados = await tx.$executeRaw`
    UPDATE incidente i
    SET caducado_en = i.vigente_hasta, actualizado_en = now()
    WHERE i.id = ${id} AND ${POR_CADUCAR}`;
  return marcados === 1;
}

/** La foto que cerró el incidente (la última del cierre), si quedó RESUELTO. */
export async function buscarFotoCierre(id: number) {
  const [fila] = await prisma.$queryRaw<{ id: number | null }[]>`
    SELECT max(f.id) AS id
    FROM fotografia f
    JOIN cierre_incidente ci ON ci.id = f.cierre_id
    JOIN incidente i ON i.id = ci.incidente_id
    WHERE ci.incidente_id = ${id} AND i.estado = 'RESUELTO'`;
  return fila?.id ?? null;
}

export function listarFotos(id: number) {
  return prisma.$queryRaw<{ id: number }[]>`
    SELECT f.id
    FROM fotografia f
    JOIN (SELECT r.id ${REPORTES_VISIBLES_DEL_INCIDENTE(id)}) validos ON validos.id = f.reporte_id
    ORDER BY f.id`;
}
