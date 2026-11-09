import { prisma } from '../../compartido/prisma.js';

export function buscarUsuario(id: number) {
  return prisma.usuario.findUnique({ where: { id }, select: { eliminadoEn: true } });
}

export async function existePerfilActivo(id: number) {
  return (await prisma.perfilMovilidad.count({ where: { id, activo: true } })) > 0;
}

export function actualizarUsuario(
  id: number,
  cambios: { perfilMovilidadId?: number | null; notificacionesHabilitadas?: boolean },
) {
  return prisma.usuario.update({ where: { id }, data: { ...cambios, actualizadoEn: new Date() } });
}

/**
 * Una fila por cada categoría activa, en el orden de GET /api/categorias. Si el vecino nunca tocó una categoría,
 * no tiene fila en preferencia_notificacion y recibe sus avisos.
 */
export function listarPreferencias(usuarioId: number) {
  return prisma.$queryRaw<{ categoriaId: number; habilitada: boolean }[]>`
    SELECT c.id AS "categoriaId", coalesce(p.habilitada, true) AS habilitada
    FROM categoria c
    LEFT JOIN preferencia_notificacion p ON p.categoria_id = c.id AND p.usuario_id = ${usuarioId}
    WHERE c.activa
    ORDER BY c.nombre`;
}

export async function categoriasActivas(ids: number[]) {
  const filas = await prisma.categoria.findMany({
    where: { id: { in: ids }, activa: true },
    select: { id: true },
  });
  return new Set(filas.map((fila) => fila.id));
}

export function guardarPreferencias(
  usuarioId: number,
  preferencias: { categoriaId: number; habilitada: boolean }[],
) {
  return prisma.$transaction(
    preferencias.map(({ categoriaId, habilitada }) =>
      prisma.preferenciaNotificacion.upsert({
        where: { usuarioId_categoriaId: { usuarioId, categoriaId } },
        create: { usuarioId, categoriaId, habilitada },
        update: { habilitada },
      }),
    ),
  );
}
