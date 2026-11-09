import { ErrorApp } from '../../compartido/errores.js';
import { codificarCursor, type Filtros, type PedidoFeed } from './esquemas.js';
import * as repositorio from './repositorio.js';

const noEncontrado = () => new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');

export async function listar(filtros: Filtros) {
  return { incidentes: await repositorio.listarVisibles(filtros) };
}

const urlFoto = (id: number) => ({ id, url: `/api/fotos/${id}` });

export async function listarFeed(pedido: PedidoFeed) {
  const filas = await repositorio.listarFeed(pedido);
  const pagina = filas.slice(0, pedido.limite);
  const ultima = pagina.at(-1);
  return {
    incidentes: pagina.map(
      ({
        categoriaId,
        categoriaNombre,
        cursorMicrosegundos: _cursor,
        cantidadVecinos,
        fotoIds,
        cantidadFotos,
        cantidadMeGusta,
        cantidadComentarios,
        ...datos
      }) => ({
        ...datos,
        categoria: { id: categoriaId, nombre: categoriaNombre },
        // count() de PostgreSQL llega como bigint: se pasa a número para el JSON.
        cantidadVecinos: Number(cantidadVecinos),
        fotos: fotoIds.map(urlFoto),
        cantidadFotos: Number(cantidadFotos),
        cantidadMeGusta: Number(cantidadMeGusta),
        cantidadComentarios: Number(cantidadComentarios),
      }),
    ),
    // Vino una fila de más: hay otra página, que arranca después de la última que se muestra.
    siguiente:
      filas.length > pedido.limite && ultima
        ? codificarCursor({ microsegundos: Number(ultima.cursorMicrosegundos), id: ultima.id })
        : null,
  };
}

/**
 * El incidente que ve el público al pedir [id]: si se unió a otro, el principal. No hay cadenas: el principal
 * nunca está unido. Desestimado, caducado o inexistente: 404, porque para el público no existe.
 */
export async function buscarVisible(id: number) {
  const pedido = await repositorio.buscarPrincipal(id);
  if (!pedido) throw noEncontrado();
  const incidente = await repositorio.buscarVisible(pedido.incidentePrincipalId ?? pedido.id);
  if (!incidente) throw noEncontrado();
  return incidente;
}

export async function obtenerFicha(id: number) {
  const incidente = await buscarVisible(id);
  const principalId = incidente.id;

  const [cantidadVecinos, fotos, fotoCierre] = await Promise.all([
    repositorio.contarVecinos(principalId),
    repositorio.listarFotos(principalId),
    repositorio.buscarFotoCierre(principalId),
  ]);

  const { categoriaId, categoriaNombre, ...datos } = incidente;
  return {
    ...datos,
    categoria: { id: categoriaId, nombre: categoriaNombre },
    cantidadVecinos,
    fotos: fotos.map(({ id: fotoId }) => urlFoto(fotoId)),
    // El después (F09): la foto que cerró el incidente, para mostrarla junto a las del antes.
    fotoCierre: fotoCierre === null ? null : urlFoto(fotoCierre),
  };
}
