import { type EstadoIncidente, Prisma } from '@prisma/client';
import { z } from 'zod';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { estaMasAvanzado, severidadConsolidada } from '../agrupacion/calculo.js';
import { bloquearCategoria, recalcularEstado, severidadesDeclaradas } from '../agrupacion/repositorio.js';
import { transaccion } from '../reportes/repositorio.js';
import { esquemaId } from './esquemas.js';
import { avisarCambioIncidente } from './eventos.js';

type Tx = Prisma.TransactionClient;

const esquemaUnion = z.object({
  principalId: z.coerce
    .number({ error: 'Tiene que ser un número' })
    .pipe(z.int32({ error: 'No es válido' }).positive({ error: 'No es válido' })),
  comentario: z
    .string({ error: 'Tiene que ser un texto' })
    .trim()
    .max(1000, { error: 'Tiene que tener hasta 1000 caracteres' })
    .optional()
    .transform((texto) => texto || null),
});

interface IncidenteBloqueado {
  id: number;
  estado: EstadoIncidente;
  caducado: boolean;
  principalId: number | null;
  cantidadReportes: number;
  /** El del área a la que se derivó o, si todavía no se derivó, el del área de su categoría. */
  organismoId: number;
  /** Si otro incidente está unido a este. */
  tieneUnidos: boolean;
}

/**
 * Los incidentes pedidos, bloqueados hasta que termine la transacción y siempre en el mismo orden (por id):
 * dos uniones cruzadas a la vez no se trancan entre sí.
 */
async function bloquear(tx: Tx, ids: number[]) {
  const filas = await tx.$queryRaw<IncidenteBloqueado[]>`
    SELECT i.id, i.estado::text AS estado,
           (i.caducado_en IS NOT NULL OR (i.vigente_hasta IS NOT NULL AND i.vigente_hasta <= now())) AS caducado,
           i.incidente_principal_id AS "principalId", i.cantidad_reportes AS "cantidadReportes",
           a.organismo_id AS "organismoId",
           EXISTS (SELECT 1 FROM incidente u WHERE u.incidente_principal_id = i.id) AS "tieneUnidos"
    FROM incidente i
    JOIN categoria c ON c.id = i.categoria_id
    JOIN area a ON a.id = coalesce(i.area_id, c.area_id)
    WHERE i.id IN (${Prisma.join(ids)})
    ORDER BY i.id
    FOR UPDATE OF i`;
  return new Map(filas.map((fila) => [fila.id, fila]));
}

/**
 * El mismo bloqueo por categoría que el alta y la separación, para las categorías de los dos incidentes y en
 * orden: mientras se une o se desune, ningún reporte nuevo se suma a ellos ni se separa uno de ellos.
 */
async function bloquearCategorias(tx: Tx, ids: number[]) {
  const incidentes = await tx.incidente.findMany({
    where: { id: { in: ids } },
    select: { categoriaId: true },
  });
  const categorias = [...new Set(incidentes.map((incidente) => incidente.categoriaId))].sort((a, b) => a - b);
  for (const categoriaId of categorias) await bloquearCategoria(tx, categoriaId);
}

const noEncontrado = () => new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');
const conflicto = (codigo: string, mensaje: string) => new ErrorApp(409, codigo, mensaje);
const activo = (i: IncidenteBloqueado) =>
  !i.caducado && i.estado !== 'RESUELTO' && i.estado !== 'DESESTIMADO';

/**
 * Severidad consolidada y primer reporte del principal, con los reportes propios y los de sus unidos
 * (REPORTES_DEL_INCIDENTE). Si no le queda ninguno sin desestimar, conserva la severidad que tenía.
 */
async function recalcularPrincipal(
  tx: Tx,
  id: number,
  cantidadReportes: { increment: number } | { decrement: number },
) {
  const declaradas = await severidadesDeclaradas(tx, id);
  const [fila] = await tx.$queryRaw<{ primero: Date | null }[]>`
    SELECT min(r.registrado_en) AS primero
    FROM reporte r JOIN incidente i ON i.id = r.incidente_id
    WHERE i.id = ${id} OR i.incidente_principal_id = ${id}`;
  const primero = fila?.primero;
  return tx.incidente.update({
    where: { id },
    data: {
      cantidadReportes,
      ...(declaradas.length > 0 && { severidad: severidadConsolidada(declaradas) }),
      ...(primero && { primerReporteEn: primero }),
      actualizadoEn: new Date(),
    },
    select: { id: true, estado: true, cantidadReportes: true, severidad: true },
  });
}

/**
 * Un operador marca que un incidente es el mismo problema que otro (F05). Unir no borra ni mueve nada: el
 * duplicado apunta al principal y conserva su estado y sus reportes; el principal suma sus reportes y deja de
 * mostrarse el duplicado en el mapa (su ficha muestra la del principal). Se puede deshacer.
 */
export async function unirIncidentes(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const { principalId, comentario } = validar(esquemaUnion, cuerpo ?? {});
  if (id === principalId) {
    throw conflicto('MISMO_INCIDENTE', 'Un incidente no se puede unir consigo mismo');
  }

  return transaccion(async (tx) => {
    await bloquearCategorias(tx, [id, principalId]);
    const bloqueados = await bloquear(tx, [id, principalId]);
    const duplicado = bloqueados.get(id);
    const principal = bloqueados.get(principalId);
    if (!duplicado || !principal) throw noEncontrado();
    if (duplicado.organismoId !== sesion.organismoId || principal.organismoId !== sesion.organismoId) {
      throw new ErrorApp(403, 'SIN_PERMISO', 'Los dos incidentes tienen que ser de tu organismo');
    }
    // Un solo nivel: ni el duplicado ni el principal pueden estar unidos, ni el duplicado tener unidos.
    if (duplicado.principalId !== null) throw conflicto('YA_UNIDO', 'El incidente ya está unido a otro');
    if (principal.principalId !== null) {
      throw conflicto('PRINCIPAL_UNIDO', 'El principal está unido a otro: uní con ese');
    }
    if (duplicado.tieneUnidos) {
      throw conflicto('TIENE_UNIDOS', 'El incidente tiene otros unidos: no se puede unir a otro');
    }
    if (!activo(duplicado) || !activo(principal)) {
      throw conflicto(
        'INCIDENTE_CERRADO',
        'Solo se unen incidentes activos (no resueltos, desestimados ni caducados)',
      );
    }
    // El principal no cambia de estado: si el duplicado iba más adelante, el problema saldría de la bandeja.
    if (estaMasAvanzado(duplicado.estado, principal.estado)) {
      throw conflicto(
        'DUPLICADO_MAS_AVANZADO',
        `El #${id} está más avanzado (${duplicado.estado}) que el #${principalId} (${principal.estado}): ` +
          `uní el #${principalId} al #${id}`,
      );
    }

    await tx.incidente.update({
      where: { id },
      data: { incidentePrincipalId: principalId, actualizadoEn: new Date() },
    });
    const actualizado = await recalcularPrincipal(tx, principalId, { increment: duplicado.cantidadReportes });

    const nota = comentario ? `: ${comentario}` : '';
    await tx.movimientoIncidente.createMany({
      data: [
        {
          incidenteId: id,
          usuarioId: sesion.id,
          tipo: 'FUSION',
          incidenteRelacionadoId: principalId,
          comentario: `Unido al incidente #${principalId}${nota}`,
        },
        {
          incidenteId: principalId,
          usuarioId: sesion.id,
          tipo: 'FUSION',
          incidenteRelacionadoId: id,
          comentario: `Se le unió el incidente #${id}${nota}`,
        },
      ],
    });
    await avisarCambioIncidente(tx, principalId);
    await avisarCambioIncidente(tx, id);

    return { id, principal: actualizado };
  });
}

/**
 * Deshace la unión: el duplicado vuelve a ser un incidente aparte y el principal deja de contar sus reportes.
 * Mientras estuvieron unidos, los reportes del duplicado se revisaron sobre el principal: al separarlos, cada
 * uno toma el estado que dicen sus propios reportes (estadoSegunReportes), con un CAMBIO_ESTADO del sistema.
 */
export async function deshacerUnion(sesion: UsuarioSesion, parametros: unknown) {
  const { id } = validar(esquemaId, parametros);

  return transaccion(async (tx) => {
    // Primero se ve a cuál está unido, y después se bloquean los dos en el mismo orden que al unir.
    const previo = await tx.incidente.findUnique({ where: { id }, select: { incidentePrincipalId: true } });
    if (!previo) throw noEncontrado();
    const principalId = previo.incidentePrincipalId;
    if (principalId === null) throw conflicto('NO_UNIDO', 'El incidente no está unido a otro');
    await bloquearCategorias(tx, [id, principalId]);
    const bloqueados = await bloquear(tx, [id, principalId]);
    const duplicado = bloqueados.get(id)!;
    const principal = bloqueados.get(principalId)!;
    // Otro operador pudo deshacerla entre la lectura y el bloqueo.
    if (duplicado.principalId !== principalId) {
      throw conflicto('NO_UNIDO', 'La unión ya se deshizo o cambió');
    }
    if (duplicado.organismoId !== sesion.organismoId || principal.organismoId !== sesion.organismoId) {
      throw new ErrorApp(403, 'SIN_PERMISO', 'Los dos incidentes tienen que ser de tu organismo');
    }

    await tx.incidente.update({
      where: { id },
      data: { incidentePrincipalId: null, actualizadoEn: new Date() },
    });
    const actualizado = await recalcularPrincipal(tx, principalId, { decrement: duplicado.cantidadReportes });

    await tx.movimientoIncidente.createMany({
      data: [
        {
          incidenteId: id,
          usuarioId: sesion.id,
          tipo: 'SEPARACION',
          incidenteRelacionadoId: principalId,
          comentario: `Se deshizo la unión con el incidente #${principalId}`,
        },
        {
          incidenteId: principalId,
          usuarioId: sesion.id,
          tipo: 'SEPARACION',
          incidenteRelacionadoId: id,
          comentario: `Se deshizo la unión con el incidente #${id}`,
        },
      ],
    });
    const motivo = (otro: number) =>
      `Estado según sus propios reportes, al deshacer la unión con el #${otro}`;
    const estado = await recalcularEstado(tx, principalId, motivo(id));
    await recalcularEstado(tx, id, motivo(principalId));
    await avisarCambioIncidente(tx, principalId);
    await avisarCambioIncidente(tx, id);

    return { id, principal: { ...actualizado, estado } };
  });
}
