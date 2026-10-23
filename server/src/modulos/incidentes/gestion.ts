import type { EstadoIncidente, Prisma } from '@prisma/client';
import { z } from 'zod';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { bloquearIncidente } from '../prioridad/repositorio.js';
import { transaccion } from '../reportes/repositorio.js';
import { registrarMovimiento } from './bitacora.js';
import { transicionValida } from './calculo.js';
import { esquemaId } from './esquemas.js';
import { avisarCambioIncidente } from './eventos.js';

type Tx = Prisma.TransactionClient;

export const comentarioOpcional = z
  .string({ error: 'Tiene que ser un texto' })
  .trim()
  .max(1000, { error: 'Tiene que tener hasta 1000 caracteres' })
  .optional()
  .transform((texto) => texto || null);

const comentarioObligatorio = z
  .string({ error: 'Es obligatorio' })
  .trim()
  .min(1, { error: 'Es obligatorio' })
  .max(1000, { error: 'Tiene que tener hasta 1000 caracteres' });

export const idEnCuerpo = z.coerce
  .number({ error: 'Tiene que ser un número' })
  .pipe(z.int32({ error: 'No es válido' }).positive({ error: 'No es válido' }));

const esquemaDerivacion = z.object({ areaId: idEnCuerpo, comentario: comentarioOpcional });

// Derivar tiene su propia ruta, y a RESUELTO solo se llega por el cierre (corte 75 %).
const esquemaEstado = z
  .object({
    estado: z.enum(['EN_EJECUCION', 'DESESTIMADO'], { error: 'Tiene que ser EN_EJECUCION o DESESTIMADO' }),
    comentario: comentarioOpcional,
  })
  .refine(({ estado, comentario }) => estado !== 'DESESTIMADO' || comentario !== null, {
    error: 'Es obligatorio para desestimar',
    path: ['comentario'],
  });

const esquemaComentario = z.object({ comentario: comentarioObligatorio });

export const datosInvalidos = (campo: string, mensaje: string) =>
  new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [{ campo, mensaje }]);

const nota = (comentario: string | null) => (comentario ? `: ${comentario}` : '');

/** El incidente bloqueado, si existe y es del organismo de quien lo pide. Primero el permiso. */
async function bloquearDelOrganismo(tx: Tx, sesion: UsuarioSesion, id: number) {
  const incidente = await bloquearIncidente(tx, id);
  if (!incidente) throw new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');
  if (incidente.organismoId !== sesion.organismoId) {
    throw new ErrorApp(403, 'SIN_PERMISO', 'El incidente es de otro organismo');
  }
  return incidente;
}

/**
 * El incidente bloqueado, si el operador lo puede trabajar: es de su organismo, no está unido a otro (se
 * trabaja el principal) y no caducó. Lo usan derivar, cambiar el estado y cambiar la categoría.
 */
export async function bloquearParaGestion(tx: Tx, sesion: UsuarioSesion, id: number) {
  const incidente = await bloquearDelOrganismo(tx, sesion, id);
  if (incidente.unido) {
    throw new ErrorApp(
      409,
      'INCIDENTE_UNIDO',
      'El incidente está unido a otro: se trabaja sobre el principal',
    );
  }
  if (incidente.caducado) {
    throw new ErrorApp(409, 'INCIDENTE_CADUCADO', 'El incidente caducó: ya no está vigente');
  }
  return incidente;
}

function exigirTransicion(desde: EstadoIncidente, hacia: EstadoIncidente) {
  if (!transicionValida(desde, hacia, 'OPERADOR')) {
    throw new ErrorApp(409, 'TRANSICION_INVALIDA', `Un incidente ${desde} no puede pasar a ${hacia}`);
  }
}

/**
 * El operador deriva el incidente a un área de su organismo (F08): de VERIFICADO o DERIVADO a DERIVADO, con
 * un movimiento DERIVACION. Re-derivar a otra área se permite; a la misma, no.
 */
export async function derivarIncidente(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const { areaId, comentario } = validar(esquemaDerivacion, cuerpo ?? {});

  return transaccion(async (tx) => {
    const incidente = await bloquearParaGestion(tx, sesion, id);
    const area = await tx.area.findUnique({
      where: { id: areaId },
      select: { id: true, nombre: true, activa: true, organismoId: true },
    });
    if (!area || area.organismoId !== incidente.organismoId) {
      throw datosInvalidos('areaId', 'No es un área de tu organismo');
    }
    if (!area.activa) throw datosInvalidos('areaId', 'El área no está activa');
    exigirTransicion(incidente.estado, 'DERIVADO');
    if (incidente.areaId === areaId) {
      throw new ErrorApp(409, 'MISMA_AREA', `El incidente ya está derivado a ${area.nombre}`);
    }

    const anterior =
      incidente.areaId === null
        ? null
        : await tx.area.findUniqueOrThrow({ where: { id: incidente.areaId }, select: { nombre: true } });
    await tx.incidente.update({
      where: { id },
      data: { areaId, estado: 'DERIVADO', actualizadoEn: new Date() },
    });
    const movimiento = await registrarMovimiento(tx, {
      incidenteId: id,
      usuarioId: sesion.id,
      tipo: 'DERIVACION',
      areaId,
      estadoAnterior: incidente.estado,
      estadoNuevo: 'DERIVADO',
      comentario: anterior
        ? `Derivado de ${anterior.nombre} a ${area.nombre}${nota(comentario)}`
        : `Derivado a ${area.nombre}${nota(comentario)}`,
    });
    await avisarCambioIncidente(tx, id);

    return { id, estado: 'DERIVADO' as const, area: { id: area.id, nombre: area.nombre }, movimiento };
  });
}

/**
 * El operador registra el avance (F08): pasa un incidente derivado a EN_EJECUCION, o lo desestima con un
 * motivo. Desestimar el incidente no toca sus reportes: reporte e incidente son cosas distintas (regla 1).
 */
export async function cambiarEstado(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const { estado, comentario } = validar(esquemaEstado, cuerpo ?? {});

  return transaccion(async (tx) => {
    const incidente = await bloquearParaGestion(tx, sesion, id);
    exigirTransicion(incidente.estado, estado);

    await tx.incidente.update({ where: { id }, data: { estado, actualizadoEn: new Date() } });
    const movimiento = await registrarMovimiento(tx, {
      incidenteId: id,
      usuarioId: sesion.id,
      tipo: 'CAMBIO_ESTADO',
      estadoAnterior: incidente.estado,
      estadoNuevo: estado,
      comentario: `${estado === 'DESESTIMADO' ? 'Desestimado' : 'Pasó a ejecución'}${nota(comentario)}`,
    });
    // Un desestimado no se recalcula (prioridad/servicio.ts), pero el aviso va igual: es un cambio de estado.
    await avisarCambioIncidente(tx, id);

    return { id, estado, movimiento };
  });
}

/**
 * El operador deja un comentario en la bitácora. Se puede en cualquier estado, también en un incidente
 * cerrado o unido: no cambia nada del incidente.
 */
export async function comentarIncidente(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const { comentario } = validar(esquemaComentario, cuerpo ?? {});

  return transaccion(async (tx) => {
    await bloquearDelOrganismo(tx, sesion, id);
    const movimiento = await registrarMovimiento(tx, {
      incidenteId: id,
      usuarioId: sesion.id,
      tipo: 'COMENTARIO',
      comentario,
    });
    return { id, movimiento };
  });
}
