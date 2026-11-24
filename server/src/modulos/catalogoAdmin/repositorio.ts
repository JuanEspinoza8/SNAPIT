import type { Prisma } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';
import { ATRIBUTOS_TRAMO_PERFIL } from '../../semilla/datos.js';
import { claveRegla, REGLAS_TRAMO, type ReglaTramo } from '../recorridos/calculo.js';

export type Tx = Prisma.TransactionClient;

export function transaccion<T>(fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(fn);
}

const camposCategoria = {
  id: true,
  nombre: true,
  descripcion: true,
  tipoVigenciaDefault: true,
  diasCaducidadDefault: true,
  pesoSeveridadBase: true,
  activa: true,
  area: { select: { id: true, nombre: true, activa: true } },
  categoriaPerfiles: {
    orderBy: { perfilMovilidad: { nombre: 'asc' } },
    select: {
      intransitable: true,
      factorPenalizacion: true,
      perfilMovilidad: { select: { id: true, nombre: true, activo: true } },
    },
  },
} satisfies Prisma.CategoriaSelect;

type CategoriaLeida = Prisma.CategoriaGetPayload<{ select: typeof camposCategoria }>;

/** La categoría como la ve la administración: los decimales como números y su fila de la matriz por perfil. */
function categoriaPublica({ categoriaPerfiles, pesoSeveridadBase, ...categoria }: CategoriaLeida) {
  return {
    ...categoria,
    pesoSeveridadBase: Number(pesoSeveridadBase),
    perfiles: categoriaPerfiles.map(({ perfilMovilidad, intransitable, factorPenalizacion }) => ({
      perfilMovilidadId: perfilMovilidad.id,
      nombre: perfilMovilidad.nombre,
      activo: perfilMovilidad.activo,
      intransitable,
      factorPenalizacion: Number(factorPenalizacion),
    })),
  };
}

export async function listarCategorias() {
  const categorias = await prisma.categoria.findMany({
    select: camposCategoria,
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
  });
  return categorias.map(categoriaPublica);
}

export async function leerCategoria(tx: Tx, id: number) {
  const categoria = await tx.categoria.findUnique({ where: { id }, select: camposCategoria });
  return categoria && categoriaPublica(categoria);
}

/** Bloquea la fila: dos cambios a la misma categoría a la vez no se pisan. */
export async function bloquearCategoria(tx: Tx, id: number) {
  const filas = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM categoria WHERE id = ${id} FOR UPDATE`;
  return filas.length > 0 ? tx.categoria.findUnique({ where: { id } }) : null;
}

/**
 * El área, con su organismo bloqueado. Es el mismo bloqueo que toma la baja de un área (#165): así no se da de
 * baja un área mientras se le asigna una categoría.
 */
export async function bloquearArea(tx: Tx, areaId: number) {
  await tx.$queryRaw`
    SELECT o.id FROM organismo o JOIN area a ON a.organismo_id = o.id WHERE a.id = ${areaId} FOR UPDATE OF o`;
  return tx.area.findUnique({ where: { id: areaId }, select: { id: true, activa: true } });
}

export function categoriaConNombre(tx: Tx, nombre: string, excepto?: number) {
  return tx.categoria.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, ...(excepto ? { id: { not: excepto } } : {}) },
  });
}

export function perfilConNombre(tx: Tx, nombre: string, excepto?: number) {
  return tx.perfilMovilidad.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, ...(excepto ? { id: { not: excepto } } : {}) },
  });
}

type DatosCategoriaBase = {
  nombre: string;
  descripcion: string | null;
  areaId: number;
  tipoVigenciaDefault: 'PERMANENTE' | 'TEMPORAL';
  diasCaducidadDefault: number | null;
  pesoSeveridadBase: number;
};

/** Crea la categoría con su fila de la matriz para cada perfil, en factor 1: sin efecto hasta que se ajuste. */
export async function crearCategoria(tx: Tx, datos: DatosCategoriaBase) {
  const categoria = await tx.categoria.create({
    data: { ...datos, pesoSeveridadBase: datos.pesoSeveridadBase.toFixed(2) },
  });
  const perfiles = await tx.perfilMovilidad.findMany({ select: { id: true } });
  await tx.categoriaPerfil.createMany({
    data: perfiles.map((perfil) => ({ categoriaId: categoria.id, perfilMovilidadId: perfil.id })),
  });
  return categoria.id;
}

export function actualizarCategoria(tx: Tx, id: number, datos: DatosCategoriaBase & { activa?: boolean }) {
  return tx.categoria.update({
    where: { id },
    data: { ...datos, pesoSeveridadBase: datos.pesoSeveridadBase.toFixed(2) },
  });
}

export function darDeBajaCategoria(tx: Tx, id: number) {
  return tx.categoria.update({ where: { id }, data: { activa: false } });
}

export async function perfilesExistentes(tx: Tx, ids: number[]) {
  const perfiles = await tx.perfilMovilidad.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return new Set(perfiles.map((perfil) => perfil.id));
}

export function guardarCelda(
  tx: Tx,
  categoriaId: number,
  celda: { perfilMovilidadId: number; intransitable: boolean; factorPenalizacion: number },
) {
  const datos = {
    intransitable: celda.intransitable,
    factorPenalizacion: celda.factorPenalizacion.toFixed(2),
  };
  return tx.categoriaPerfil.upsert({
    where: { categoriaId_perfilMovilidadId: { categoriaId, perfilMovilidadId: celda.perfilMovilidadId } },
    create: { categoriaId, perfilMovilidadId: celda.perfilMovilidadId, ...datos },
    update: datos,
  });
}

/**
 * Los incidentes de la categoría cuya prioridad sigue viva: los mismos filtros que el recálculo diario
 * (prioridad/repositorio.ts, listarAbiertos), solo de esta categoría.
 */
export async function abiertosDeLaCategoria(categoriaId: number) {
  const incidentes = await prisma.incidente.findMany({
    where: {
      categoriaId,
      estado: { notIn: ['RESUELTO', 'DESESTIMADO'] },
      incidentePrincipalId: null,
      caducadoEn: null,
      OR: [{ vigenteHasta: null }, { vigenteHasta: { gt: new Date() } }],
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return incidentes.map((incidente) => incidente.id);
}

// --- Perfiles de movilidad ---

/** Lo que dice cada regla de un perfil en parametro_sistema: la misma frase que carga la semilla. */
export const descripcionRegla = (regla: ReglaTramo, perfil: string) =>
  `Cuánto le cuesta a ${perfil} pasar por ${ATRIBUTOS_TRAMO_PERFIL[regla].describe}: un número que multiplica el costo del tramo (1 no lo cambia) o «intransitable» para que el recorrido lo evite`;

export async function listarPerfiles() {
  const perfiles = await prisma.perfilMovilidad.findMany({
    select: { id: true, nombre: true, descripcion: true, activo: true },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
  });
  const claves = perfiles.flatMap((perfil) => REGLAS_TRAMO.map((regla) => claveRegla(regla, perfil.id)));
  const valores = new Map(
    (await prisma.parametroSistema.findMany({ where: { clave: { in: claves } } })).map((fila) => [
      fila.clave,
      fila.valor,
    ]),
  );
  return perfiles.map((perfil) => ({
    ...perfil,
    // Una regla sin clave no le cambia el costo: valor null.
    reglas: REGLAS_TRAMO.map((regla) => {
      const clave = claveRegla(regla, perfil.id);
      return { regla, clave, valor: valores.get(clave) ?? null };
    }),
  }));
}

export async function bloquearPerfil(tx: Tx, id: number) {
  const filas = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM perfil_movilidad WHERE id = ${id} FOR UPDATE`;
  return filas.length > 0 ? tx.perfilMovilidad.findUnique({ where: { id } }) : null;
}

/**
 * Crea el perfil con su fila de la matriz para cada categoría y sus reglas de tramo, todo en factor 1: sin
 * efecto, para que el administrador lo vea y lo ajuste.
 */
export async function crearPerfil(tx: Tx, datos: { nombre: string; descripcion: string | null }) {
  const perfil = await tx.perfilMovilidad.create({ data: datos });
  const categorias = await tx.categoria.findMany({ select: { id: true } });
  await tx.categoriaPerfil.createMany({
    data: categorias.map((categoria) => ({ categoriaId: categoria.id, perfilMovilidadId: perfil.id })),
  });
  await tx.parametroSistema.createMany({
    data: REGLAS_TRAMO.map((regla) => ({
      clave: claveRegla(regla, perfil.id),
      valor: '1.0',
      tipo: 'factor',
      descripcion: descripcionRegla(regla, perfil.nombre),
    })),
    skipDuplicates: true,
  });
  return perfil;
}

export async function actualizarPerfil(
  tx: Tx,
  id: number,
  datos: { nombre: string; descripcion: string | null; activo?: boolean },
) {
  const perfil = await tx.perfilMovilidad.update({ where: { id }, data: datos });
  // La descripción de sus reglas lo nombra.
  for (const regla of REGLAS_TRAMO) {
    await tx.parametroSistema.updateMany({
      where: { clave: claveRegla(regla, id) },
      data: { descripcion: descripcionRegla(regla, perfil.nombre) },
    });
  }
  return perfil;
}

/** Baja lógica. Quien lo tenía elegido vuelve a «sin perfil»: no se le ofrece uno que ya no está. */
export async function darDeBajaPerfil(tx: Tx, id: number) {
  await tx.perfilMovilidad.update({ where: { id }, data: { activo: false } });
  await tx.usuario.updateMany({ where: { perfilMovilidadId: id }, data: { perfilMovilidadId: null } });
}
