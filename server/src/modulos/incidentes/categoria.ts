import { z } from 'zod';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { bloquearCategoria } from '../agrupacion/repositorio.js';
import { leerPrioridad } from '../prioridad/repositorio.js';
import { transaccion } from '../reportes/repositorio.js';
import { registrarMovimiento } from './bitacora.js';
import { esquemaId } from './esquemas.js';
import { avisarCambioIncidente } from './eventos.js';
import { bloquearParaGestion, comentarioOpcional, datosInvalidos, idEnCuerpo } from './gestion.js';

const esquemaCategoria = z.object({ categoriaId: idEnCuerpo, comentario: comentarioOpcional });

/**
 * El operador corrige la categoría de un incidente abierto (F06). La que eligió cada vecino en su reporte no
 * cambia. No hay un tipo de movimiento para esto: queda un COMENTARIO con la categoría de antes y la nueva.
 * Se recalcula la prioridad, porque la categoría pesa en la severidad. La vigencia no cambia: es la que el
 * incidente tomó al nacer.
 */
export async function cambiarCategoria(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const { categoriaId, comentario } = validar(esquemaCategoria, cuerpo ?? {});

  return transaccion(async (tx) => {
    // El bloqueo de la agrupación, de la categoría de antes y de la nueva y en orden, como la unión: mientras
    // tanto ningún reporte se suma a este incidente como si fuera de la categoría vieja.
    const previo = await tx.incidente.findUnique({ where: { id }, select: { categoriaId: true } });
    if (!previo) throw new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');
    const categorias = [...new Set([previo.categoriaId, categoriaId])].sort((a, b) => a - b);
    for (const bloqueada of categorias) await bloquearCategoria(tx, bloqueada);

    const incidente = await bloquearParaGestion(tx, sesion, id);
    if (incidente.estado === 'RESUELTO' || incidente.estado === 'DESESTIMADO') {
      throw new ErrorApp(409, 'INCIDENTE_CERRADO', 'El incidente está resuelto o desestimado');
    }
    // Otro operador la cambió entre la lectura y el bloqueo: el bloqueo que se tomó no es el de la vieja.
    if (incidente.categoriaId !== previo.categoriaId) {
      throw new ErrorApp(
        409,
        'CATEGORIA_CAMBIADA',
        'La categoría del incidente acaba de cambiar: volvé a intentar',
      );
    }

    const nueva = await tx.categoria.findUnique({
      where: { id: categoriaId },
      select: {
        id: true,
        nombre: true,
        activa: true,
        area: { select: { id: true, nombre: true, organismoId: true } },
      },
    });
    if (!nueva || !nueva.activa) throw datosInvalidos('categoriaId', 'No existe o no está activa');
    // Sin derivar, el incidente es del organismo del área de su categoría: pasaría a otro organismo.
    if (nueva.area.organismoId !== incidente.organismoId) {
      throw datosInvalidos('categoriaId', 'Es de un área de otro organismo');
    }
    if (nueva.id === incidente.categoriaId) {
      throw new ErrorApp(409, 'MISMA_CATEGORIA', `El incidente ya es de la categoría ${nueva.nombre}`);
    }

    const anterior = await tx.categoria.findUniqueOrThrow({
      where: { id: incidente.categoriaId },
      select: { nombre: true },
    });
    await tx.incidente.update({ where: { id }, data: { categoriaId, actualizadoEn: new Date() } });
    const nota = comentario ? `: ${comentario}` : '';
    const movimiento = await registrarMovimiento(tx, {
      incidenteId: id,
      usuarioId: sesion.id,
      tipo: 'COMENTARIO',
      comentario: `Categoría cambiada de ${anterior.nombre} a ${nueva.nombre}${nota}`,
    });
    await avisarCambioIncidente(tx, id);

    // Si ya se derivó, sigue en su área; si no, pasa al área de la categoría nueva.
    const area =
      incidente.areaId === null
        ? nueva.area
        : await tx.area.findUniqueOrThrow({
            where: { id: incidente.areaId },
            select: { id: true, nombre: true },
          });
    const prioridad = await leerPrioridad(tx, id);
    return {
      id,
      categoria: { id: nueva.id, nombre: nueva.nombre },
      area: { id: area.id, nombre: area.nombre },
      prioridad: {
        puntajePrioridad: prioridad.puntajePrioridad,
        prioridadManual: prioridad.prioridadManual,
        factores: prioridad.factores,
      },
      movimiento,
    };
  });
}
