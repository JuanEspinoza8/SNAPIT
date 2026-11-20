import type { EstadoIncidente, EstadoVerificacion } from '@prisma/client';
import { ErrorApp } from '../../compartido/errores.js';
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

/**
 * El vecino elimina su propio reporte (#150): baja lógica, completa `eliminado_en`. Solo su autor; ni el operador
 * ni el administrador eliminan reportes (los desestiman en la revisión).
 *
 * Para el cálculo cuenta como un desestimado: se resta de `cantidad_reportes` (del incidente y del principal, si
 * se unió a otro), deja de pesar en la severidad consolidada y en el estado, y se avisa a la prioridad. La
 * reputación del vecino no cambia. Un pendiente sale de la revisión y de la cola de la IA (verificacion/
 * repositorio.ts filtra los eliminados). Un desestimado ya no contaba: solo deja de verse en Mis reportes.
 *
 * No se puede eliminar el único reporte visible de su incidente (sin contar los unidos): el incidente quedaría
 * sin nada que mostrar. 409 UNICO_REPORTE.
 */
export async function eliminarReporte(sesion: UsuarioSesion, parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
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
    if (reporte.usuarioId !== sesion.id) {
      throw new ErrorApp(403, 'SIN_PERMISO', 'Solo quien hizo el reporte lo puede eliminar');
    }

    const eliminar = () => tx.reporte.update({ where: { id }, data: { eliminadoEn: new Date() } });
    // Un desestimado ya no cuenta en nada: solo se esconde de Mis reportes.
    if (reporte.estado === 'DESESTIMADO') {
      await eliminar();
      return;
    }

    const { propioId, incidenteId } = await verificacion.leerReporte(tx, id);
    const incidentes = [propioId, incidenteId].filter((otro) => otro !== null);
    if (incidentes.length > 0) await verificacion.bloquearIncidentes(tx, incidentes);

    if (propioId !== null) {
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
    await recalcularEstado(tx, incidenteId, `Reporte #${id} eliminado por su autor`);
    const declaradas = await severidadesDeclaradas(tx, incidenteId);
    if (declaradas.length > 0) {
      await verificacion.actualizarIncidente(tx, incidenteId, {
        severidad: severidadConsolidada(declaradas),
      });
    }
    await avisarCambioIncidente(tx, incidenteId);
  });
}
