import { Prisma } from '@prisma/client';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { bloquearIncidente } from '../prioridad/repositorio.js';
import { transaccion } from '../reportes/repositorio.js';
import { esquemaId } from './esquemas.js';
import { avisarCambioIncidente } from './eventos.js';
import * as repositorio from './repositorio.js';
import { vigenciaAlConfirmar } from './vigencia.js';

// Un vecino confirma que el problema sigue (F12), una sola vez. Como en la ficha y el seguimiento, confirmar un
// incidente unido a otro es confirmar el principal.

type Tx = Prisma.TransactionClient;

const noEncontrado = () => new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');
const yaConfirmado = () => new ErrorApp(409, 'YA_CONFIRMADO', 'Ya confirmaste que este problema sigue');

/**
 * Guarda la confirmación en el principal, renueva la vigencia si es temporal y recalcula la prioridad. La
 * confirmación de quien ya lo reportó no suma evidencia (docs/calculos.md), pero renueva la vigencia igual.
 */
export async function confirmar(sesion: UsuarioSesion, parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  try {
    return await transaccion(async (tx) => {
      const { principalId, incidente } = await bloquearPrincipal(tx, id);
      if (incidente.estado === 'RESUELTO' || incidente.estado === 'DESESTIMADO') {
        throw new ErrorApp(409, 'INCIDENTE_CERRADO', 'El incidente está resuelto o desestimado');
      }
      if (incidente.caducado) {
        throw new ErrorApp(409, 'INCIDENTE_CADUCADO', 'El incidente caducó: ya no está vigente');
      }
      if (await repositorio.yaConfirmo(sesion.id, principalId, tx)) throw yaConfirmado();

      await repositorio.insertarConfirmacion(tx, principalId, sesion.id);
      await renovarVigencia(tx, principalId);
      await avisarCambioIncidente(tx, principalId);
      return {
        incidenteId: principalId,
        cantidadConfirmaciones: await repositorio.contarConfirmaciones(principalId, tx),
      };
    });
  } catch (error) {
    // El bloqueo ya ordena dos pedidos a la vez del mismo vecino. Si igual chocaran, la clave única
    // (incidente, usuario) descarta el segundo.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw yaConfirmado();
    }
    throw error;
  }
}

/** Si el vecino ya confirmó el incidente que se ve en la ficha (o uno que después se le unió). */
export async function consultarConfirmacion(sesion: UsuarioSesion, parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  const incidente = await repositorio.buscarPrincipal(id);
  if (!incidente) throw noEncontrado();
  return {
    confirmado: await repositorio.yaConfirmo(sesion.id, incidente.incidentePrincipalId ?? incidente.id),
  };
}

/**
 * El principal del incidente pedido, bloqueado hasta que termine la transacción: así un reporte que se suma a
 * la vez espera, y dos confirmaciones del mismo vecino van de a una. Si mientras se esperaba el bloqueo se unió
 * a otro, se busca el principal nuevo y se vuelve a bloquear, hasta que no cambie. No se bloquea el duplicado
 * pedido: la unión bloquea los dos en orden de id, y hacerlo acá en otro orden podría trabarlas.
 */
async function bloquearPrincipal(tx: Tx, id: number) {
  let principalId = id;
  for (;;) {
    const pedido = await tx.incidente.findUnique({
      where: { id: principalId },
      select: { incidentePrincipalId: true },
    });
    if (!pedido) throw noEncontrado();
    principalId = pedido.incidentePrincipalId ?? principalId;
    const incidente = await bloquearIncidente(tx, principalId);
    if (incidente && !incidente.unido) return { principalId, incidente };
  }
}

/** En un temporal, vigente_hasta pasa a max(actual, ahora + días de su categoría). Un permanente no cambia. */
async function renovarVigencia(tx: Tx, id: number) {
  const { tipoVigencia, vigenteHasta, categoria } = await tx.incidente.findUniqueOrThrow({
    where: { id },
    select: { tipoVigencia: true, vigenteHasta: true, categoria: { select: { diasCaducidadDefault: true } } },
  });
  const ahora = new Date();
  const renovada = await vigenciaAlConfirmar({ tipoVigencia, vigenteHasta }, categoria, ahora, tx);
  if (renovada.vigenteHasta?.getTime() === vigenteHasta?.getTime()) return;
  await tx.incidente.update({
    where: { id },
    data: { vigenteHasta: renovada.vigenteHasta, actualizadoEn: ahora },
  });
}
