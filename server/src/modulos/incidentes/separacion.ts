import type { EstadoVerificacion, Prisma, Severidad } from '@prisma/client';
import { z } from 'zod';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { severidadConsolidada } from '../agrupacion/calculo.js';
import * as agrupacion from '../agrupacion/repositorio.js';
import { recalcularEstado } from '../agrupacion/repositorio.js';
import { insertarIncidente, transaccion } from '../reportes/repositorio.js';
import { vigenciaDeCategoria } from '../reportes/servicio.js';
import { esquemaId } from './esquemas.js';
import { avisarCambioIncidente } from './eventos.js';

type Tx = Prisma.TransactionClient;

const esquemaSeparacion = z.object({
  comentario: z
    .string({ error: 'Tiene que ser un texto' })
    .trim()
    .max(1000, { error: 'Tiene que tener hasta 1000 caracteres' })
    .optional()
    .transform((texto) => texto || null),
});

interface ReporteASeparar {
  incidenteId: number | null;
  /** Si su incidente se unió a otro (#54), el principal. */
  principalId: number | null;
  categoriaId: number;
  /** La del incidente, que es la que bloquean el alta y la unión. Hoy coincide con la del reporte (#66). */
  categoriaIncidenteId: number | null;
  estado: EstadoVerificacion;
  severidad: Severidad;
  lat: number;
  lon: number;
  direccion: string | null;
  registradoEn: Date;
  /** Cuándo llegó al servidor: desde ahí se cuenta la vigencia del incidente nuevo. */
  llegadaEn: Date;
  /** El del área a la que se derivó su incidente o, si todavía no se derivó, el del área de su categoría. */
  organismoId: number;
}

/** El reporte, bloqueado hasta que termine la transacción. Undefined si no existe. */
async function bloquearReporte(tx: Tx, id: number) {
  const [fila] = await tx.$queryRaw<ReporteASeparar[]>`
    SELECT r.incidente_id AS "incidenteId", i.incidente_principal_id AS "principalId",
           r.categoria_id AS "categoriaId", i.categoria_id AS "categoriaIncidenteId",
           r.estado_verificacion::text AS estado, r.severidad_declarada::text AS severidad,
           ST_Y(r.ubicacion::geometry) AS lat, ST_X(r.ubicacion::geometry) AS lon,
           r.direccion, r.registrado_en AS "registradoEn",
           coalesce(r.sincronizado_en, r.registrado_en) AS "llegadaEn", a.organismo_id AS "organismoId"
    FROM reporte r
    LEFT JOIN incidente i ON i.id = r.incidente_id
    JOIN categoria c ON c.id = coalesce(i.categoria_id, r.categoria_id)
    JOIN area a ON a.id = coalesce(i.area_id, c.area_id)
    WHERE r.id = ${id}
    FOR UPDATE OF r`;
  return fila;
}

async function bloquearIncidente(tx: Tx, id: number) {
  const [fila] = await tx.$queryRaw<{ principalId: number | null }[]>`
    SELECT incidente_principal_id AS "principalId" FROM incidente WHERE id = ${id} FOR UPDATE`;
  return fila!;
}

/**
 * Cuántos reportes propios no desestimados tiene el incidente, sin contar el que se va a separar. Los de los
 * incidentes unidos a él no cuentan: al deshacer la unión se van, y el incidente quedaría vacío.
 */
async function contarOtrosValidos(tx: Tx, incidenteId: number, reporteId: number) {
  const [fila] = await tx.$queryRaw<{ cantidad: number }[]>`
    SELECT count(*)::int AS cantidad
    FROM reporte r
    WHERE r.incidente_id = ${incidenteId} AND r.id <> ${reporteId} AND r.estado_verificacion <> 'DESESTIMADO'`;
  return fila!.cantidad;
}

/** El primer reporte que le queda al incidente, contando los de sus unidos, para su primer_reporte_en. */
async function primerReporteEn(tx: Tx, incidenteId: number) {
  const [fila] = await tx.$queryRaw<{ primero: Date }[]>`
    SELECT min(r.registrado_en) AS primero
    FROM reporte r JOIN incidente i ON i.id = r.incidente_id
    WHERE i.id = ${incidenteId} OR i.incidente_principal_id = ${incidenteId}`;
  return fila!.primero;
}

/**
 * Si el incidente está en el punto del reporte que se fue (el que lo creó), pasa al punto y la dirección del
 * reporte válido propio que llegó primero. Si no, se queda donde está: lo ubicó otro reporte.
 */
async function reubicarSiHaceFalta(tx: Tx, incidenteId: number, reporteSeparadoId: number) {
  await tx.$executeRaw`
    UPDATE incidente i
    SET ubicacion = otro.ubicacion, direccion = otro.direccion
    FROM (SELECT r.ubicacion, r.direccion
          FROM reporte r
          WHERE r.incidente_id = ${incidenteId} AND r.estado_verificacion <> 'DESESTIMADO'
          ORDER BY r.id
          LIMIT 1) otro
    WHERE i.id = ${incidenteId}
      AND ST_Equals(i.ubicacion::geometry,
                    (SELECT s.ubicacion::geometry FROM reporte s WHERE s.id = ${reporteSeparadoId}))`;
}

/**
 * Saca un reporte que el sistema agrupó por error y lo deja solo en un incidente nuevo (F05). Lo hace un
 * operador u administrador del organismo del incidente. Todo en una transacción:
 * - El incidente nuevo toma la categoría, el punto, la dirección y la severidad del reporte, y la vigencia de su
 *   categoría desde que llegó el reporte (§7.6). Queda sin área: el operador lo deriva de nuevo.
 * - Al original se le resta el reporte y se recalculan su severidad y su primer reporte. Si estaba en el punto
 *   del reporte separado, pasa al del reporte que llegó primero de los que le quedan.
 * - Los dos quedan con un movimiento SEPARACION que apunta al otro. Después, cada uno toma el estado que dicen
 *   sus reportes (estadoSegunReportes), con un CAMBIO_ESTADO del sistema: el nuevo nace REGISTRADO y pasa a
 *   VERIFICADO si el reporte lo estaba; el original vuelve a REGISTRADO si se le fue el único verificado.
 * - Se avisa a la prioridad de los dos.
 */
export async function separarReporte(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const { comentario } = validar(esquemaSeparacion, cuerpo ?? {});

  return transaccion(async (tx) => {
    const reporte = await bloquearReporte(tx, id);
    if (!reporte) throw new ErrorApp(404, 'REPORTE_NO_ENCONTRADO', 'El reporte no existe');
    if (reporte.organismoId !== sesion.organismoId) {
      throw new ErrorApp(403, 'SIN_PERMISO', 'El reporte es de un incidente de otro organismo');
    }
    if (reporte.incidenteId === null) {
      throw new ErrorApp(409, 'REPORTE_SIN_INCIDENTE', 'El reporte no está en ningún incidente');
    }
    // Su incidente está unido a otro y el principal cuenta sus reportes: separarlo dejaría mal los contadores
    // del principal. Primero se deshace la unión (DELETE /api/incidentes/:id/union).
    if (reporte.principalId !== null) {
      throw new ErrorApp(
        409,
        'INCIDENTE_UNIDO',
        `El incidente está unido al #${reporte.principalId}: primero hay que deshacer la unión`,
      );
    }
    if (reporte.estado === 'DESESTIMADO') {
      throw new ErrorApp(409, 'REPORTE_DESESTIMADO', 'Un reporte desestimado no se separa');
    }

    // El mismo bloqueo que el alta de un reporte y la unión: mientras tanto, ningún reporte nuevo se suma a
    // estos incidentes y nadie los une.
    await agrupacion.bloquearCategoria(tx, reporte.categoriaIncidenteId ?? reporte.categoriaId);
    const originalId = reporte.incidenteId;
    const original = await bloquearIncidente(tx, originalId);
    // Se pudo unir entre la primera lectura y el bloqueo.
    if (original.principalId !== null) {
      throw new ErrorApp(
        409,
        'INCIDENTE_UNIDO',
        `El incidente está unido al #${original.principalId}: primero hay que deshacer la unión`,
      );
    }
    if ((await contarOtrosValidos(tx, originalId, id)) === 0) {
      throw new ErrorApp(409, 'UNICO_REPORTE', 'Es el único reporte del incidente: no hay de qué separarlo');
    }

    const categoria = await tx.categoria.findUniqueOrThrow({ where: { id: reporte.categoriaId } });
    const nuevoId = await insertarIncidente(tx, {
      categoriaId: reporte.categoriaId,
      severidad: reporte.severidad,
      lat: reporte.lat,
      lon: reporte.lon,
      ...(await vigenciaDeCategoria(categoria, reporte.llegadaEn)),
      primerReporteEn: reporte.registradoEn,
    });
    const ahora = new Date();
    await tx.incidente.update({
      where: { id: nuevoId },
      data: { direccion: reporte.direccion, cantidadReportes: 1, actualizadoEn: ahora },
    });
    await tx.reporte.update({ where: { id }, data: { incidenteId: nuevoId } });

    // Ya sin el reporte separado: la severidad consolidada (#53) y el primer reporte son los de los que quedan.
    const severidad = severidadConsolidada(await agrupacion.severidadesDeclaradas(tx, originalId));
    await tx.incidente.update({
      where: { id: originalId },
      data: {
        cantidadReportes: { decrement: 1 },
        severidad,
        primerReporteEn: await primerReporteEn(tx, originalId),
        actualizadoEn: ahora,
      },
    });
    await reubicarSiHaceFalta(tx, originalId, id);

    const nota = comentario ? `: ${comentario}` : '';
    await tx.movimientoIncidente.createMany({
      data: [
        {
          incidenteId: originalId,
          usuarioId: sesion.id,
          tipo: 'SEPARACION',
          incidenteRelacionadoId: nuevoId,
          comentario: `Reporte #${id} separado al incidente #${nuevoId}${nota}`,
        },
        {
          incidenteId: nuevoId,
          usuarioId: sesion.id,
          tipo: 'SEPARACION',
          incidenteRelacionadoId: originalId,
          comentario: `Reporte #${id} separado del incidente #${originalId}${nota}`,
        },
      ],
    });
    const motivo = `Estado según sus reportes, después de separar el reporte #${id}`;
    const estadoNuevo = await recalcularEstado(tx, nuevoId, motivo);
    await recalcularEstado(tx, originalId, motivo);
    await avisarCambioIncidente(tx, originalId);
    await avisarCambioIncidente(tx, nuevoId);

    const quedan = await tx.incidente.findUniqueOrThrow({
      where: { id: originalId },
      select: { cantidadReportes: true, severidad: true, estado: true },
    });
    return {
      reporteId: id,
      incidenteNuevo: { id: nuevoId, estado: estadoNuevo, cantidadReportes: 1, severidad: reporte.severidad },
      incidenteOriginal: { id: originalId, ...quedan },
    };
  });
}
