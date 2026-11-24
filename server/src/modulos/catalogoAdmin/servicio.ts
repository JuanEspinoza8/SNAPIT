import { ErrorApp } from '../../compartido/errores.js';
import { invalidarParametros } from '../../compartido/parametros.js';
import { validar } from '../../compartido/validar.js';
import { recalcularIncidentes } from '../prioridad/servicio.js';
import {
  esquemaAltaCategoria,
  esquemaAltaPerfil,
  esquemaCategoria,
  esquemaId,
  esquemaMatriz,
  esquemaPerfil,
} from './esquemas.js';
import * as repositorio from './repositorio.js';

// Categorías, perfiles de movilidad y la matriz categoría × perfil (#166). Nada se borra: dar de baja es marcarlo
// inactivo. Una categoría inactiva deja de ofrecerse al reportar y a la IA; un perfil inactivo, en los recorridos.

const categoriaNoEncontrada = () => new ErrorApp(404, 'CATEGORIA_NO_ENCONTRADA', 'La categoría no existe');
const perfilNoEncontrado = () =>
  new ErrorApp(404, 'PERFIL_NO_ENCONTRADO', 'El perfil de movilidad no existe');
const nombreEnUso = (mensaje: string) =>
  new ErrorApp(409, 'NOMBRE_EN_USO', mensaje, [{ campo: 'nombre', mensaje }]);
const datosInvalidos = (campo: string, mensaje: string) =>
  new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [{ campo, mensaje }]);

/** Si dos guardan el mismo nombre a la vez, el control previo no alcanza: la base tiene el nombre único. */
async function conNombreUnico<T>(mensaje: string, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') throw nombreEnUso(mensaje);
    throw error;
  }
}

const NOMBRE_DE_CATEGORIA = 'Ya hay una categoría con ese nombre';
const NOMBRE_DE_PERFIL = 'Ya hay un perfil de movilidad con ese nombre';

export async function listarCategorias() {
  return { categorias: await repositorio.listarCategorias() };
}

/** El área de una categoría tiene que existir y estar activa: si no, sus reportes no tendrían a quién derivarse. */
async function controlarArea(tx: repositorio.Tx, areaId: number) {
  const area = await repositorio.bloquearArea(tx, areaId);
  if (!area) throw datosInvalidos('areaId', 'No existe esa área');
  if (!area.activa) throw datosInvalidos('areaId', 'El área está inactiva');
}

/** Da de alta una categoría con su fila de la matriz para cada perfil, en factor 1. */
export async function crearCategoria(cuerpo: unknown) {
  const datos = validar(esquemaAltaCategoria, cuerpo ?? {});
  const categoria = await conNombreUnico(NOMBRE_DE_CATEGORIA, () =>
    repositorio.transaccion(async (tx) => {
      await controlarArea(tx, datos.areaId);
      if (await repositorio.categoriaConNombre(tx, datos.nombre)) throw nombreEnUso(NOMBRE_DE_CATEGORIA);
      const id = await repositorio.crearCategoria(tx, datos);
      return repositorio.leerCategoria(tx, id);
    }),
  );
  return { categoria: categoria! };
}

/**
 * Modifica una categoría. Si cambia el peso, se recalcula enseguida la prioridad de sus incidentes abiertos. Si
 * cambia la vigencia, vale para los incidentes nuevos: cada uno guardó la suya al crearse. Si cambia el área, los
 * incidentes que todavía no se derivaron pasan a la nueva (y a su organismo).
 */
export async function modificarCategoria(parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const datos = validar(esquemaCategoria, cuerpo ?? {});

  const { categoria, cambioElPeso } = await conNombreUnico(NOMBRE_DE_CATEGORIA, () =>
    repositorio.transaccion(async (tx) => {
      const actual = await repositorio.bloquearCategoria(tx, id);
      if (!actual) throw categoriaNoEncontrada();
      const quedaActiva = datos.activa ?? actual.activa;
      // Una inactiva puede quedar en un área dada de baja (así se dio de baja el área); activa, no.
      if (quedaActiva && (datos.areaId !== actual.areaId || !actual.activa))
        await controlarArea(tx, datos.areaId);
      if (!quedaActiva && datos.areaId !== actual.areaId) {
        const area = await repositorio.bloquearArea(tx, datos.areaId);
        if (!area) throw datosInvalidos('areaId', 'No existe esa área');
      }
      if (await repositorio.categoriaConNombre(tx, datos.nombre, id)) throw nombreEnUso(NOMBRE_DE_CATEGORIA);
      await repositorio.actualizarCategoria(tx, id, datos);
      return {
        categoria: (await repositorio.leerCategoria(tx, id))!,
        cambioElPeso: Number(actual.pesoSeveridadBase) !== datos.pesoSeveridadBase,
      };
    }),
  );

  const prioridadesRecalculadas = cambioElPeso
    ? (await recalcularIncidentes(await repositorio.abiertosDeLaCategoria(id))).recalculados
    : 0;
  return { categoria, prioridadesRecalculadas };
}

/** Baja lógica. Sus incidentes y reportes siguen como estaban; deja de poder elegirse al reportar. */
export async function darDeBajaCategoria(parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  await repositorio.transaccion(async (tx) => {
    const categoria = await repositorio.bloquearCategoria(tx, id);
    if (!categoria) throw categoriaNoEncontrada();
    if (categoria.activa) await repositorio.darDeBajaCategoria(tx, id);
  });
}

/** Cambia celdas de la fila de la matriz de una categoría: cuánto le estorba a cada perfil (F11). */
export async function guardarMatriz(parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const { perfiles } = validar(esquemaMatriz, cuerpo ?? {});
  const ids = perfiles.map((celda) => celda.perfilMovilidadId);
  const repetido = ids.find((perfilId, i) => ids.indexOf(perfilId) !== i);
  if (repetido)
    throw datosInvalidos(`perfiles.${ids.lastIndexOf(repetido)}.perfilMovilidadId`, 'Viene más de una vez');

  const categoria = await repositorio.transaccion(async (tx) => {
    if (!(await repositorio.bloquearCategoria(tx, id))) throw categoriaNoEncontrada();
    const existentes = await repositorio.perfilesExistentes(tx, ids);
    const falta = ids.findIndex((perfilId) => !existentes.has(perfilId));
    if (falta !== -1) throw datosInvalidos(`perfiles.${falta}.perfilMovilidadId`, 'No existe ese perfil');
    for (const celda of perfiles) await repositorio.guardarCelda(tx, id, celda);
    return (await repositorio.leerCategoria(tx, id))!;
  });
  return { perfiles: categoria.perfiles };
}

// --- Perfiles de movilidad ---

export async function listarPerfiles() {
  return { perfiles: await repositorio.listarPerfiles() };
}

const perfilPublico = async (id: number) =>
  (await repositorio.listarPerfiles()).find((perfil) => perfil.id === id)!;

/**
 * Da de alta un perfil con su fila de la matriz para cada categoría y sus reglas de tramo, todo en factor 1. Las
 * reglas se ajustan como cualquier parámetro (`PUT /api/admin/parametros`).
 */
export async function crearPerfil(cuerpo: unknown) {
  const datos = validar(esquemaAltaPerfil, cuerpo ?? {});
  const perfil = await conNombreUnico(NOMBRE_DE_PERFIL, () =>
    repositorio.transaccion(async (tx) => {
      if (await repositorio.perfilConNombre(tx, datos.nombre)) throw nombreEnUso(NOMBRE_DE_PERFIL);
      return repositorio.crearPerfil(tx, datos);
    }),
  );
  invalidarParametros();
  return { perfil: await perfilPublico(perfil.id) };
}

export async function modificarPerfil(parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const datos = validar(esquemaPerfil, cuerpo ?? {});
  await conNombreUnico(NOMBRE_DE_PERFIL, () =>
    repositorio.transaccion(async (tx) => {
      const actual = await repositorio.bloquearPerfil(tx, id);
      if (!actual) throw perfilNoEncontrado();
      if (await repositorio.perfilConNombre(tx, datos.nombre, id)) throw nombreEnUso(NOMBRE_DE_PERFIL);
      const { activo, ...resto } = datos;
      if (activo === false && actual.activo) await repositorio.darDeBajaPerfil(tx, id);
      await repositorio.actualizarPerfil(tx, id, activo === true ? { ...resto, activo } : resto);
    }),
  );
  invalidarParametros();
  return { perfil: await perfilPublico(id) };
}

/** Baja lógica. Deja de ofrecerse en los recorridos, y quien lo tenía como perfil por defecto queda sin perfil. */
export async function darDeBajaPerfil(parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  await repositorio.transaccion(async (tx) => {
    const perfil = await repositorio.bloquearPerfil(tx, id);
    if (!perfil) throw perfilNoEncontrado();
    if (perfil.activo) await repositorio.darDeBajaPerfil(tx, id);
  });
}
