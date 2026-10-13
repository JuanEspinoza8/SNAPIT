import { prisma } from '../../compartido/prisma.js';
import { extraerBarrio } from '../geocodificacion/calculo.js';
import { INCIDENTE_VISIBLE } from '../incidentes/repositorio.js';

const ordenCastellano = new Intl.Collator('es');

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

/**
 * Los barrios que tienen algún incidente en el mapa, en orden alfabético. Son los valores que acepta
 * el filtro `barrio` de GET /api/incidentes. Los incidentes que todavía no tienen dirección no cuentan.
 */
export async function listarBarriosConIncidentes() {
  const filas = await prisma.$queryRaw<{ direccion: string }[]>`
    SELECT DISTINCT i.direccion
    FROM incidente i
    WHERE ${INCIDENTE_VISIBLE} AND i.direccion IS NOT NULL`;
  const barrios = new Set(filas.map((fila) => extraerBarrio(fila.direccion)));
  return [...barrios].sort(ordenCastellano.compare);
}
