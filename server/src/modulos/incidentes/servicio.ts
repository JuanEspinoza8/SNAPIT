import { ErrorApp } from '../../compartido/errores.js';
import type { Filtros } from './esquemas.js';
import * as repositorio from './repositorio.js';

// Un incidente unido apunta al principal, que a su vez podría estar unido a otro. El tope evita un ciclo.
const MAX_SALTOS = 10;

const noEncontrado = () => new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');

export async function listar(filtros: Filtros) {
  return { incidentes: await repositorio.listarVisibles(filtros) };
}

/** Si el incidente se unió a otro, la ficha es la del principal. */
async function resolverPrincipal(id: number) {
  let actual = await repositorio.buscarPrincipal(id);
  for (let salto = 0; actual?.incidentePrincipalId && salto < MAX_SALTOS; salto++) {
    actual = await repositorio.buscarPrincipal(actual.incidentePrincipalId);
  }
  if (!actual || actual.incidentePrincipalId) throw noEncontrado();
  return actual.id;
}

export async function obtenerFicha(id: number) {
  const principalId = await resolverPrincipal(id);
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
