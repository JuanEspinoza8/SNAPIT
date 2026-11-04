import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { esquemaId } from '../incidentes/esquemas.js';
import { esquemaNuevaZona, esquemaZona } from './esquemas.js';
import * as repositorio from './repositorio.js';

// Las zonas habituales de un vecino (F10): un centro y un radio para enterarse de lo nuevo que aparece ahí.
// Cada vecino ve y cambia solo las suyas. Una zona ajena responde 404, igual que una inexistente.

const noEncontrada = () => new ErrorApp(404, 'ZONA_NO_ENCONTRADA', 'La zona no existe');

export async function listarZonas(sesion: UsuarioSesion) {
  return { zonas: await repositorio.listarZonas(sesion.id) };
}

export async function crearZona(sesion: UsuarioSesion, cuerpo: unknown) {
  return repositorio.crearZona(sesion.id, validar(esquemaNuevaZona, cuerpo ?? {}));
}

export async function actualizarZona(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const zona = await repositorio.actualizarZona(sesion.id, id, validar(esquemaZona, cuerpo ?? {}));
  if (!zona) throw noEncontrada();
  return zona;
}

export async function borrarZona(sesion: UsuarioSesion, parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  if (!(await repositorio.borrarZona(sesion.id, id))) throw noEncontrada();
}
