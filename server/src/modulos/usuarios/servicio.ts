import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import { usuarioPublico } from '../auth/servicio.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { esquemaCambiosYo, esquemaPreferencias } from './esquemas.js';
import * as repositorio from './repositorio.js';

/** El usuario cambia su interruptor general de avisos (F10) o su perfil de movilidad por defecto (F11). */
export async function actualizarYo(sesion: UsuarioSesion, cuerpo: unknown) {
  const cambios = validar(esquemaCambiosYo, cuerpo ?? {});

  if (cambios.perfilMovilidadId && !(await repositorio.existePerfilActivo(cambios.perfilMovilidadId))) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: 'perfilMovilidadId', mensaje: 'No existe ese perfil de movilidad' },
    ]);
  }

  // Igual que GET /api/auth/yo: una cuenta dada de baja ya no tiene sesión válida.
  const usuario = await repositorio.buscarUsuario(sesion.id);
  if (!usuario || usuario.eliminadoEn) {
    throw new ErrorApp(401, 'TOKEN_INVALIDO', 'La sesión no es válida. Volvé a ingresar');
  }

  return { usuario: usuarioPublico(await repositorio.actualizarUsuario(sesion.id, cambios)) };
}

export async function listarPreferencias(sesion: UsuarioSesion) {
  return { preferencias: await repositorio.listarPreferencias(sesion.id) };
}

/** Cambia solo las categorías que vienen en la lista; las demás quedan como estaban. */
export async function guardarPreferencias(sesion: UsuarioSesion, cuerpo: unknown) {
  const { preferencias } = validar(esquemaPreferencias, cuerpo ?? {});

  const activas = await repositorio.categoriasActivas(preferencias.map((p) => p.categoriaId));
  const detalles = preferencias.flatMap((p, i) =>
    activas.has(p.categoriaId)
      ? []
      : [{ campo: `preferencias.${i}.categoriaId`, mensaje: 'No existe esa categoría' }],
  );
  if (detalles.length > 0) throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', detalles);

  await repositorio.guardarPreferencias(sesion.id, preferencias);
  return listarPreferencias(sesion);
}
