import { prisma } from '../../compartido/prisma.js';

/** Categorías que el vecino puede elegir al reportar. El peso y la caducidad son internos: no se exponen. */
export function listarCategoriasActivas() {
  return prisma.categoria.findMany({
    where: { activa: true },
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      tipoVigenciaDefault: true,
      area: { select: { id: true, nombre: true } },
    },
    orderBy: { nombre: 'asc' },
  });
}

export function listarPerfilesActivos() {
  return prisma.perfilMovilidad.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, descripcion: true },
    orderBy: { nombre: 'asc' },
  });
}
