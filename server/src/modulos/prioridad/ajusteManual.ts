import type { EstadoIncidente, Prisma } from '@prisma/client';
import { z } from 'zod';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { esquemaId } from '../incidentes/esquemas.js';
import { transaccion } from '../reportes/repositorio.js';
import { MAXIMO_COLUMNA } from './calculo.js';
import * as repositorio from './repositorio.js';
import { recalcularPrioridad } from './servicio.js';

const esquemaAjuste = z.object({
  valor: z
    .number({
      error: (problema) => (problema.input === undefined ? 'Es obligatorio' : 'Tiene que ser un número'),
    })
    .min(0, { error: 'No puede ser negativo' })
    .max(MAXIMO_COLUMNA, { error: 'Puede ser hasta 9999,99' }),
  motivo: z
    .string({ error: 'Es obligatorio' })
    .trim()
    .min(1, { error: 'Es obligatorio' })
    .max(1000, { error: 'Tiene que tener hasta 1000 caracteres' }),
});

// Los que están en la bandeja. Uno REGISTRADO todavía no se verificó: no tiene sentido priorizarlo.
const ESTADOS_AJUSTABLES: EstadoIncidente[] = ['VERIFICADO', 'DERIVADO', 'EN_EJECUCION'];

const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/**
 * El incidente bloqueado, si es del organismo de quien lo pide, sigue abierto y no está unido a otro.
 * Primero el permiso: a otro organismo no se le dice en qué estado está.
 */
async function incidenteAjustable(tx: Prisma.TransactionClient, sesion: UsuarioSesion, id: number) {
  const incidente = await repositorio.bloquearIncidente(tx, id);
  if (!incidente) throw new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');
  if (incidente.organismoId !== sesion.organismoId) {
    throw new ErrorApp(403, 'SIN_PERMISO', 'El incidente es de otro organismo');
  }
  if (incidente.unido) {
    throw new ErrorApp(
      409,
      'INCIDENTE_UNIDO',
      'El incidente está unido a otro: ajustá la prioridad del principal',
    );
  }
  if (incidente.caducado || incidente.estado === 'RESUELTO' || incidente.estado === 'DESESTIMADO') {
    throw new ErrorApp(409, 'INCIDENTE_CERRADO', 'El incidente está resuelto, desestimado o caducado');
  }
  return incidente;
}

/**
 * Un operador fija la prioridad de un incidente a mano, con un motivo (F07). puntaje_prioridad sigue
 * guardando la calculada: el desglose suma AJUSTE_MANUAL con la diferencia, y la bandeja ordena por la
 * manual (PRIORIDAD_EFECTIVA). Si ya había un ajuste, lo reemplaza.
 */
export async function fijarPrioridadManual(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const { valor, motivo } = validar(esquemaAjuste, cuerpo ?? {});

  return transaccion(async (tx) => {
    const incidente = await incidenteAjustable(tx, sesion, id);
    if (!ESTADOS_AJUSTABLES.includes(incidente.estado)) {
      throw new ErrorApp(
        409,
        'INCIDENTE_NO_VERIFICADO',
        'Solo se ajusta la prioridad de un incidente verificado, derivado o en ejecución',
      );
    }

    await repositorio.guardarAjuste(tx, id, { valor, motivo, usuarioId: sesion.id });
    await recalcularPrioridad(tx, id);
    const prioridad = await repositorio.leerPrioridad(tx, id);

    await tx.movimientoIncidente.create({
      data: {
        incidenteId: id,
        usuarioId: sesion.id,
        tipo: 'AJUSTE_PRIORIDAD',
        comentario: `Prioridad fijada en ${numero.format(prioridad.prioridadManual!)} (la calculada es ${numero.format(prioridad.puntajePrioridad)}): ${motivo}`,
      },
    });
    return prioridad;
  });
}

/** Quita el ajuste: el incidente vuelve a ordenarse por la prioridad calculada. */
export async function quitarPrioridadManual(sesion: UsuarioSesion, parametros: unknown) {
  const { id } = validar(esquemaId, parametros);

  return transaccion(async (tx) => {
    const incidente = await incidenteAjustable(tx, sesion, id);
    if (incidente.prioridadManual === null) {
      throw new ErrorApp(409, 'SIN_PRIORIDAD_MANUAL', 'El incidente no tiene una prioridad fijada a mano');
    }

    await repositorio.guardarAjuste(tx, id, null);
    await recalcularPrioridad(tx, id);
    const prioridad = await repositorio.leerPrioridad(tx, id);

    await tx.movimientoIncidente.create({
      data: {
        incidenteId: id,
        usuarioId: sesion.id,
        tipo: 'AJUSTE_PRIORIDAD',
        comentario: `Se quitó la prioridad manual de ${numero.format(incidente.prioridadManual)}: vuelve a la calculada, ${numero.format(prioridad.puntajePrioridad)}`,
      },
    });
    return prioridad;
  });
}
