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
        ...datos
      }) => ({
        ...datos,
        categoria: { id: categoriaId, nombre: categoriaNombre },
        // count() de PostgreSQL llega como bigint: se pasa a número para el JSON.
        cantidadVecinos: Number(cantidadVecinos),
        fotos: fotoIds.map(urlFoto),
        cantidadFotos: Number(cantidadFotos),
      }),
    ),
    // Vino una fila de más: hay otra página, que arranca después de la última que se muestra.
    siguiente:
      filas.length > pedido.limite && ultima
        ? codificarCursor({ microsegundos: Number(ultima.cursorMicrosegundos), id: ultima.id })
        : null,
  };
}

export async function obtenerFicha(id: number) {
  const pedido = await repositorio.buscarPrincipal(id);
  if (!pedido) throw noEncontrado();
  // Si se unió a otro, la ficha es la del principal. No hay cadenas: el principal nunca está unido.
  const principalId = pedido.incidentePrincipalId ?? pedido.id;
  const incidente = await repositorio.buscarVisible(principalId);
  // Desestimado o caducado: para el público no existe.
  if (!incidente) throw noEncontrado();

  const [cantidadVecinos, fotos] = await Promise.all([
    repositorio.contarVecinos(principalId),
    repositorio.listarFotos(principalId),
  ]);

  const { categoriaId, categoriaNombre, ...datos } = incidente;
  return {
    ...datos,
    categoria: { id: categoriaId, nombre: categoriaNombre },
    cantidadVecinos,
    fotos: fotos.map(({ id: fotoId }) => urlFoto(fotoId)),
  };
}
