import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { esquemaId } from '../incidentes/esquemas.js';
import { buscarPrincipal } from '../incidentes/repositorio.js';
import { buscarVisible } from '../incidentes/servicio.js';
import * as repositorio from './repositorio.js';

// Un vecino sigue un incidente para enterarse de sus cambios (F10). Igual que la ficha, pedir un incidente unido
// a otro es pedir el principal.

/** Sigue el incidente que se ve en la ficha. Uno desestimado o caducado da 404, como su ficha. */
export async function seguir(sesion: UsuarioSesion, parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  const incidente = await buscarVisible(id);
  await repositorio.seguir(sesion.id, incidente.id);
}

/**
 * Deja de seguirlo, incluido lo que siguió en un incidente que después se unió a este. Funciona aunque ya no se
 * vea en el mapa, y no falla si no lo seguía.
 */
export async function dejarDeSeguir(sesion: UsuarioSesion, parametros: unknown) {
  await repositorio.dejarDeSeguir(sesion.id, await principalDe(parametros));
}

export async function consultarSeguimiento(sesion: UsuarioSesion, parametros: unknown) {
  return { siguiendo: await repositorio.estaSiguiendo(sesion.id, await principalDe(parametros)) };
}

async function principalDe(parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  const incidente = await buscarPrincipal(id);
  if (!incidente) throw new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');
  return incidente.incidentePrincipalId ?? incidente.id;
}
