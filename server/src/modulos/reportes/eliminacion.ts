import type { EstadoIncidente, EstadoVerificacion } from '@prisma/client';
import { z } from 'zod';
import { ErrorApp } from '../../compartido/errores.js';
import { prisma } from '../../compartido/prisma.js';
import { validar } from '../../compartido/validar.js';
import { severidadConsolidada } from '../agrupacion/calculo.js';
import { recalcularEstado, severidadesDeclaradas } from '../agrupacion/repositorio.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { avisarCambioIncidente } from '../incidentes/eventos.js';
import { esquemaId } from '../incidentes/esquemas.js';
import { MARCADO_PARA_DESESTIMAR } from '../incidentes/repositorio.js';
import * as verificacion from '../verificacion/repositorio.js';
import { transaccion } from './repositorio.js';

const ESTADOS_CERRADOS: EstadoIncidente[] = ['RESUELTO', 'DESESTIMADO'];

// El motivo con que un administrador quita una publicación: queda en la bitácora y lo ve quien busque el link.
const esquemaModeracion = z.object({
  motivo: z
    .string({ error: 'Es obligatorio' })
    .trim()
    .min(1, { error: 'Es obligatorio' })
    .max(500, { error: 'Tiene que tener hasta 500 caracteres' }),
});

/** El comienzo del movimiento de bitácora de una moderación: con él se sabe después quién quitó el reporte. */
const quitadoPorAdministrador = (id: number) => `Reporte #${id} quitado por un administrador`;

/**
 * Si un administrador quitó este reporte, el motivo que dejó; si no (lo eliminó su autor, o no está eliminado),
 * null. Se lee de la bitácora, porque el modelo no guarda quién eliminó un reporte.
 */
export async function motivoDeModeracion(id: number) {
  const prefijo = quitadoPorAdministrador(id);
  const movimiento = await prisma.movimientoIncidente.findFirst({
    where: { tipo: 'COMENTARIO', comentario: { startsWith: `${prefijo}: ` } },
    orderBy: { id: 'desc' },
    select: { comentario: true },
  });
  return movimiento ? movimiento.comentario!.slice(prefijo.length + 2) : null;
}

/**
 * El vecino elimina su propio reporte (#150): baja lógica, completa `eliminado_en`. El administrador también,
 * como moderación de lo publicado (por ejemplo, una foto con datos personales que la IA dejó pasar): con un motivo,
 * que queda en la bitácora del incidente a su nombre y que ve quien abra después el link. El operador no: los
 * pendientes los desestima en la revisión.
 *
 * Para el cálculo cuenta como un desestimado: se resta de `cantidad_reportes` (del incidente y del principal, si
 * se unió a otro), deja de pesar en la severidad consolidada y en el estado, y se avisa a la prioridad. La
 * reputación del vecino no cambia. Un pendiente sale de la revisión y de la cola de la IA (verificacion/
 * repositorio.ts filtra los eliminados). Un desestimado ya no contaba: solo deja de verse en Mis reportes.
 *
 * No se puede eliminar el único reporte visible de su incidente (sin contar los unidos): el incidente quedaría
 * sin nada que mostrar. 409 UNICO_REPORTE.
 */
export async function eliminarReporte(sesion: UsuarioSesion, parametros: unknown, cuerpo?: unknown) {
  const { id } = validar(esquemaId, parametros);
  const moderacion = sesion.rol === 'ADMINISTRADOR' ? validar(esquemaModeracion, cuerpo ?? {}) : null;
  await transaccion(async (tx) => {
    // El reporte primero y después sus incidentes, en el mismo orden que la revisión: no se trancan entre sí.
    const [reporte] = await tx.$queryRaw<
      { usuarioId: number; estado: EstadoVerificacion; eliminado: boolean }[]
    >`
      SELECT usuario_id AS "usuarioId", estado_verificacion::text AS estado, eliminado_en IS NOT NULL AS eliminado
      FROM reporte WHERE id = ${id} FOR UPDATE`;
    if (!reporte || reporte.eliminado) {
      throw new ErrorApp(404, 'REPORTE_NO_ENCONTRADO', 'El reporte no existe');
    }
    if (!moderacion && reporte.usuarioId !== sesion.id) {
      throw new ErrorApp(403, 'SIN_PERMISO', 'Solo quien hizo el reporte lo puede eliminar');
    }

    const eliminar = async () => {
      await tx.reporte.update({ where: { id }, data: { eliminadoEn: new Date() } });
      if (!moderacion) return;
      // A la bitácora del incidente del reporte, a nombre del administrador.
      const { propioId, incidenteId } = await verificacion.leerReporte(tx, id);
      const enIncidente = propioId ?? incidenteId;
      if (enIncidente === null) return;
      await verificacion.registrarMovimiento(tx, {
        incidenteId: enIncidente,
        usuarioId: sesion.id,
        tipo: 'COMENTARIO',
        comentario: `${quitadoPorAdministrador(id)}: ${moderacion.motivo}`,
      });
    };
    // Un desestimado ya no cuenta en nada: solo se esconde de Mis reportes.
    if (reporte.estado === 'DESESTIMADO') {
      await eliminar();
      return;
    }

    const { propioId, incidenteId } = await verificacion.leerReporte(tx, id);
    const incidentes = [propioId, incidenteId].filter((otro) => otro !== null);
    if (incidentes.length > 0) await verificacion.bloquearIncidentes(tx, incidentes);

    // El administrador puede quitar el único: si el incidente queda sin reportes válidos, el recálculo de abajo lo
    // desestima; si ya estaba en gestión, sigue en la bandeja, porque el problema puede ser real.
    if (propioId !== null && !moderacion) {
      // Los que se ven: un marcado para desestimar no cuenta, porque mientras espera no se muestra.
      const [{ otros }] = (await tx.$queryRaw<{ otros: number }[]>`
        SELECT count(*)::int AS otros
        FROM reporte r
        WHERE r.incidente_id = ${propioId}
          AND r.id <> ${id}
          AND r.estado_verificacion <> 'DESESTIMADO'
          AND r.eliminado_en IS NULL
          AND NOT ${MARCADO_PARA_DESESTIMAR()}`) as [{ otros: number }];
      if (otros === 0) {
        throw new ErrorApp(
          409,
          'UNICO_REPORTE',
          'Es el único reporte de este problema: no se puede eliminar sin dejarlo vacío',
        );
      }
    }

    await eliminar();
    if (incidenteId === null) return;
    await verificacion.restarReporte(tx, incidentes);

    // Un incidente cerrado queda como se cerró: solo cambia su contador.
    if (ESTADOS_CERRADOS.includes(await verificacion.bloquearIncidente(tx, incidenteId))) return;
    await recalcularEstado(
      tx,
      incidenteId,
      moderacion ? quitadoPorAdministrador(id) : `Reporte #${id} eliminado por su autor`,
    );
    const declaradas = await severidadesDeclaradas(tx, incidenteId);
    if (declaradas.length > 0) {
      await verificacion.actualizarIncidente(tx, incidenteId, {
        severidad: severidadConsolidada(declaradas),
      });
    }
    await avisarCambioIncidente(tx, incidenteId);
  });
}
