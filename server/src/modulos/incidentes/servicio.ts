import { ErrorApp } from '../../compartido/errores.js';
import type { Filtros } from './esquemas.js';
import * as repositorio from './repositorio.js';

const noEncontrado = () => new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');

export async function listar(filtros: Filtros) {
  return { incidentes: await repositorio.listarVisibles(filtros) };
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
    fotos: fotos.map(({ id: fotoId }) => ({ id: fotoId, url: `/api/fotos/${fotoId}` })),
  };
}
