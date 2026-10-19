import type { EstadoIncidente, EstadoVerificacion, Prisma, Severidad } from '@prisma/client';
import { z } from 'zod';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { severidadConsolidada } from '../agrupacion/calculo.js';
import * as agrupacion from '../agrupacion/repositorio.js';
import { insertarIncidente, transaccion } from '../reportes/repositorio.js';
import { avisarCambioIncidente } from './eventos.js';

type Tx = Prisma.TransactionClient;

const esquemaId = z.object({
  id: z.coerce
    .number({ error: 'No es válido' })
    .pipe(z.int32({ error: 'No es válido' }).positive({ error: 'No es válido' })),
});

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
  categoriaId: number;
  estado: EstadoVerificacion;
  severidad: Severidad;
  lat: number;
  lon: number;
  direccion: string | null;
  registradoEn: Date;
  /** El del área a la que se derivó su incidente o, si todavía no se derivó, el del área de su categoría. */
  organismoId: number;
}

/** El reporte, bloqueado hasta que termine la transacción. Undefined si no existe. */
async function bloquearReporte(tx: Tx, id: number) {
  const [fila] = await tx.$queryRaw<ReporteASeparar[]>`
    SELECT r.incidente_id AS "incidenteId", r.categoria_id AS "categoriaId",
           r.estado_verificacion::text AS estado, r.severidad_declarada::text AS severidad,
           ST_Y(r.ubicacion::geometry) AS lat, ST_X(r.ubicacion::geometry) AS lon,
           r.direccion, r.registrado_en AS "registradoEn", a.organismo_id AS "organismoId"
    FROM reporte r
    LEFT JOIN incidente i ON i.id = r.incidente_id
    JOIN categoria c ON c.id = coalesce(i.categoria_id, r.categoria_id)
    JOIN area a ON a.id = coalesce(i.area_id, c.area_id)
    WHERE r.id = ${id}
    FOR UPDATE OF r`;
  return fila;
}

async function bloquearIncidente(tx: Tx, id: number) {
  const [fila] = await tx.$queryRaw<{ tipoVigencia: 'PERMANENTE' | 'TEMPORAL'; vigenteHasta: Date | null }[]>`
    SELECT tipo_vigencia::text AS "tipoVigencia", vigente_hasta AS "vigenteHasta"
    FROM incidente WHERE id = ${id} FOR UPDATE`;
  return fila!;
}

/** Cuántos reportes no desestimados tiene el incidente, sin contar el que se va a separar. */
async function contarOtrosValidos(tx: Tx, incidenteId: number, reporteId: number) {
  const [fila] = await tx.$queryRaw<{ cantidad: number }[]>`
    SELECT count(*)::int AS cantidad FROM reporte
    WHERE incidente_id = ${incidenteId} AND id <> ${reporteId} AND estado_verificacion <> 'DESESTIMADO'`;
  return fila!.cantidad;
}

/** El primer reporte que le queda al incidente, para su primer_reporte_en. */
async function primerReporteEn(tx: Tx, incidenteId: number) {
  const [fila] = await tx.$queryRaw<{ primero: Date }[]>`
    SELECT min(registrado_en) AS primero FROM reporte WHERE incidente_id = ${incidenteId}`;
  return fila!.primero;
}

/**
 * Saca un reporte que el sistema agrupó por error y lo deja solo en un incidente nuevo (F05). Lo hace un
 * operador u administrador del organismo del incidente. Todo en una transacción:
 * - El incidente nuevo toma la categoría, el punto, la dirección y la severidad del reporte, y la vigencia del
 *   original. Queda VERIFICADO si el reporte estaba verificado, o REGISTRADO si está pendiente, y sin área: el
 *   operador lo deriva de nuevo.
 * - El original conserva su estado; se le resta el reporte y se recalculan su severidad y su primer reporte.
 * - Los dos quedan con un movimiento SEPARACION que apunta al otro, y se avisa a la prioridad de los dos.
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
    if (reporte.estado === 'DESESTIMADO') {
      throw new ErrorApp(409, 'REPORTE_DESESTIMADO', 'Un reporte desestimado no se separa');
    }

    // El mismo bloqueo que el alta de un reporte: mientras tanto, ningún reporte nuevo se suma a estos incidentes.
    await agrupacion.bloquearCategoria(tx, reporte.categoriaId);
    const originalId = reporte.incidenteId;
    const original = await bloquearIncidente(tx, originalId);
    if ((await contarOtrosValidos(tx, originalId, id)) === 0) {
      throw new ErrorApp(409, 'UNICO_REPORTE', 'Es el único reporte del incidente: no hay de qué separarlo');
    }

    const estadoNuevo: EstadoIncidente = reporte.estado === 'VERIFICADO' ? 'VERIFICADO' : 'REGISTRADO';
    const nuevoId = await insertarIncidente(tx, {
      categoriaId: reporte.categoriaId,
      severidad: reporte.severidad,
      lat: reporte.lat,
      lon: reporte.lon,
      tipoVigencia: original.tipoVigencia,
      vigenteHasta: original.vigenteHasta,
      primerReporteEn: reporte.registradoEn,
    });
    const ahora = new Date();
    await tx.incidente.update({
      where: { id: nuevoId },
      data: { estado: estadoNuevo, direccion: reporte.direccion, cantidadReportes: 1, actualizadoEn: ahora },
    });
    await tx.reporte.update({ where: { id }, data: { incidenteId: nuevoId } });

    // Ya sin el reporte separado: la severidad consolidada (#53) y el primer reporte son los de los que quedan.
    const severidad = severidadConsolidada(await agrupacion.severidadesDeclaradas(tx, originalId));
    const quedan = await tx.incidente.update({
      where: { id: originalId },
      data: {
        cantidadReportes: { decrement: 1 },
        severidad,
        primerReporteEn: await primerReporteEn(tx, originalId),
        actualizadoEn: ahora,
      },
      select: { cantidadReportes: true, severidad: true, estado: true },
    });

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
    await avisarCambioIncidente(tx, originalId);
    await avisarCambioIncidente(tx, nuevoId);

    return {
      reporteId: id,
      incidenteNuevo: { id: nuevoId, estado: estadoNuevo, cantidadReportes: 1, severidad: reporte.severidad },
      incidenteOriginal: { id: originalId, ...quedan },
    };
  });
}
