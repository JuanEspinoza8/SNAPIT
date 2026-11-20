import bcrypt from 'bcryptjs';
import { type DetalleError, ErrorApp } from '../../compartido/errores.js';
import { COSTO_BCRYPT, usuarioPublico } from '../auth/servicio.js';
import { USUARIO_SISTEMA } from '../../compartido/usuarioSistema.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { type DatosAltaUsuario, esquemaIdUsuario, esquemaModificacionUsuario } from './esquemas.js';
import * as repositorio from './repositorio.js';

/** Controla que el organismo y el área existan, estén activos y que el área sea de ese organismo. */
async function controlarOrganismoYArea(organismoId: number | null, areaId: number | null) {
  const detalles: DetalleError[] = [];

  if (organismoId !== null) {
    const organismo = await repositorio.buscarOrganismo(organismoId);
    if (!organismo) {
      detalles.push({ campo: 'organismoId', mensaje: 'No existe ese organismo' });
    } else if (!organismo.activo) {
      detalles.push({ campo: 'organismoId', mensaje: 'El organismo está inactivo' });
    }
  }

  if (areaId !== null) {
    const area = await repositorio.buscarArea(areaId);
    if (!area) {
      detalles.push({ campo: 'areaId', mensaje: 'No existe esa área' });
    } else if (area.organismoId !== organismoId) {
      detalles.push({ campo: 'areaId', mensaje: 'El área no pertenece a ese organismo' });
    } else if (!area.activa) {
      detalles.push({ campo: 'areaId', mensaje: 'El área está inactiva' });
    }
  }

  if (detalles.length > 0) throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', detalles);
}

export async function crearUsuario(datos: DatosAltaUsuario) {
  const organismoId = datos.organismoId ?? null;
  const areaId = datos.areaId ?? null;
  await controlarOrganismoYArea(organismoId, areaId);

  try {
    const usuario = await repositorio.crearUsuario({
      email: datos.email,
      nombre: datos.nombre,
      rol: datos.rol,
      organismoId,
      areaId,
      passwordHash: await bcrypt.hash(datos.clave, COSTO_BCRYPT),
      // Lo da de alta un administrador, así que puede ingresar sin confirmar el correo.
      emailVerificadoEn: new Date(),
    });
    return { usuario: usuarioPublico(usuario) };
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      throw new ErrorApp(409, 'EMAIL_EN_USO', 'Ya hay una cuenta con ese correo');
    }
    throw error;
  }
}

const noEncontrado = () => new ErrorApp(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe');

/**
 * El usuario a modificar o dar de baja, bloqueado. Uno dado de baja no existe para la administración, y SnapIt no
 * se administra: firma los comentarios del sistema.
 */
async function usuarioAdministrable(tx: repositorio.Tx, id: number) {
  const usuario = await repositorio.bloquearUsuario(tx, id);
  if (!usuario || usuario.eliminadoEn) throw noEncontrado();
  if (usuario.email === USUARIO_SISTEMA.email) {
    throw new ErrorApp(409, 'USUARIO_DEL_SISTEMA', 'El usuario de SnapIt no se puede modificar');
  }
  return usuario;
}

/** Que no quede el sistema sin nadie que lo administre. */
async function controlarQueQuedeOtroAdministrador(tx: repositorio.Tx, usuarioId: number) {
  if ((await repositorio.otrosAdministradoresActivos(tx, usuarioId)) === 0) {
    throw new ErrorApp(409, 'ULTIMO_ADMINISTRADOR', 'Es el único administrador: no puede dejar de serlo');
  }
}

/**
 * Cambia el nombre, el rol, el organismo y el área de un usuario. Si cambia su rol o dónde trabaja, se cierran
 * sus sesiones: los permisos van en el token, así que tiene que volver a ingresar. Nadie se quita a sí mismo el
 * rol de administrador, y nunca queda el sistema sin uno.
 */
export async function modificarUsuario(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaIdUsuario, parametros);
  const datos = validar(esquemaModificacionUsuario, cuerpo ?? {});
  const organismoId = datos.organismoId ?? null;
  const areaId = datos.rol === 'OPERADOR' ? (datos.areaId ?? null) : null;
  await controlarOrganismoYArea(organismoId, areaId);

  const actualizado = await repositorio.transaccion(async (tx) => {
    const usuario = await usuarioAdministrable(tx, id);
    if (usuario.rol === 'ADMINISTRADOR' && datos.rol !== 'ADMINISTRADOR') {
      if (usuario.id === sesion.id) {
        throw new ErrorApp(409, 'SOBRE_SI_MISMO', 'No podés quitarte el rol de administrador');
      }
      await controlarQueQuedeOtroAdministrador(tx, usuario.id);
    }
    const cambiaPermisos =
      usuario.rol !== datos.rol || usuario.organismoId !== organismoId || usuario.areaId !== areaId;
    const nuevo = await repositorio.actualizarUsuario(tx, id, {
      nombre: datos.nombre,
      rol: datos.rol,
      organismoId,
      areaId,
    });
    if (cambiaPermisos) await repositorio.cerrarSesiones(tx, id, new Date());
    return nuevo;
  });
  return { usuario: usuarioPublico(actualizado) };
}

/**
 * Da de baja a un usuario (baja lógica): deja de poder ingresar y se cierran sus sesiones, pero lo que hizo
 * (reportes, revisiones, movimientos) queda a su nombre. Nadie se da de baja a sí mismo desde acá, y nunca queda
 * el sistema sin administradores.
 */
export async function darDeBaja(sesion: UsuarioSesion, parametros: unknown) {
  const { id } = validar(esquemaIdUsuario, parametros);
  if (id === sesion.id) {
    throw new ErrorApp(409, 'SOBRE_SI_MISMO', 'No podés darte de baja a vos mismo');
  }
  await repositorio.transaccion(async (tx) => {
    const usuario = await usuarioAdministrable(tx, id);
    if (usuario.rol === 'ADMINISTRADOR') await controlarQueQuedeOtroAdministrador(tx, usuario.id);
    const ahora = new Date();
    await repositorio.darDeBaja(tx, id, ahora);
    await repositorio.cerrarSesiones(tx, id, ahora);
  });
}

export async function listarOrganismos() {
  return { organismos: await repositorio.listarOrganismosActivos() };
}

export async function listarUsuarios() {
  const usuarios = await repositorio.listarUsuarios();
  return { usuarios: usuarios.map(usuarioPublico) };
}
