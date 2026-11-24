import bcrypt from 'bcryptjs';
import { type DetalleError, ErrorApp } from '../../compartido/errores.js';
import { COSTO_BCRYPT, usuarioPublico } from '../auth/servicio.js';
import { USUARIO_SISTEMA } from '../../compartido/usuarioSistema.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import {
  type DatosAltaUsuario,
  esquemaAltaArea,
  esquemaAltaOrganismo,
  esquemaId,
  esquemaIdUsuario,
  esquemaListaOrganismos,
  esquemaModificacionArea,
  esquemaModificacionOrganismo,
  esquemaModificacionUsuario,
} from './esquemas.js';
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

/**
 * Sin parámetros, lo que se puede elegir al dar de alta un operador: organismos activos con sus áreas activas.
 * Con `todos=true`, la administración de organismos y áreas: también los inactivos, con más datos.
 */
export async function listarOrganismos(consulta: unknown) {
  const { todos } = validar(esquemaListaOrganismos, consulta ?? {});
  return {
    organismos: todos
      ? await repositorio.listarTodosLosOrganismos()
      : await repositorio.listarOrganismosActivos(),
  };
}

export async function listarUsuarios() {
  const usuarios = await repositorio.listarUsuarios();
  return { usuarios: usuarios.map(usuarioPublico) };
}

// --- Organismos y áreas (#165) ---
// Nada se borra: dar de baja es marcarlo inactivo. Un área inactiva no recibe derivaciones ni se ofrece al dar de
// alta operadores, pero sus incidentes siguen como están. Las altas y los cambios bloquean el organismo, así que
// nunca queda un organismo inactivo con áreas activas.

const organismoNoEncontrado = () => new ErrorApp(404, 'ORGANISMO_NO_ENCONTRADO', 'El organismo no existe');
const areaNoEncontrada = () => new ErrorApp(404, 'AREA_NO_ENCONTRADA', 'El área no existe');
const nombreEnUso = (mensaje: string) =>
  new ErrorApp(409, 'NOMBRE_EN_USO', mensaje, [{ campo: 'nombre', mensaje }]);
const organismoInvalido = (mensaje: string) =>
  new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [{ campo: 'organismoId', mensaje }]);
const lista = (filas: { nombre: string }[]) => filas.map((fila) => fila.nombre).join(', ');

async function controlarNombreDeOrganismo(tx: repositorio.Tx, nombre: string, excepto?: number) {
  await repositorio.bloquearNombresDeOrganismos(tx);
  if (await repositorio.organismoConNombre(tx, nombre, excepto)) {
    throw nombreEnUso('Ya hay un organismo con ese nombre');
  }
}

async function controlarNombreDeArea(
  tx: repositorio.Tx,
  organismoId: number,
  nombre: string,
  excepto?: number,
) {
  if (await repositorio.areaConNombre(tx, organismoId, nombre, excepto)) {
    throw nombreEnUso('El organismo ya tiene un área con ese nombre');
  }
}

/** Un organismo con áreas activas no se da de baja: quedarían áreas recibiendo trabajo de un organismo inactivo. */
async function controlarBajaDeOrganismo(tx: repositorio.Tx, organismoId: number) {
  const areas = await repositorio.areasActivas(tx, organismoId);
  if (areas.length > 0) {
    throw new ErrorApp(
      409,
      'ORGANISMO_CON_AREAS_ACTIVAS',
      `Tiene áreas activas (${lista(areas)}): primero hay que darlas de baja`,
    );
  }
}

/**
 * Un área con categorías activas no se da de baja: los reportes de esas categorías seguirían llegando a un área
 * que ya no recibe derivaciones. Primero se pasan las categorías a otra área o se dan de baja.
 */
async function controlarBajaDeArea(tx: repositorio.Tx, areaId: number) {
  const categorias = await repositorio.categoriasActivas(tx, areaId);
  if (categorias.length > 0) {
    throw new ErrorApp(
      409,
      'AREA_CON_CATEGORIAS_ACTIVAS',
      `Tiene categorías activas (${lista(categorias)}): primero hay que pasarlas a otra área o darlas de baja`,
    );
  }
}

export async function crearOrganismo(cuerpo: unknown) {
  const datos = validar(esquemaAltaOrganismo, cuerpo ?? {});
  const organismo = await repositorio.transaccion(async (tx) => {
    await controlarNombreDeOrganismo(tx, datos.nombre);
    return repositorio.crearOrganismo(tx, datos);
  });
  return { organismo };
}

export async function modificarOrganismo(parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const datos = validar(esquemaModificacionOrganismo, cuerpo ?? {});
  const organismo = await repositorio.transaccion(async (tx) => {
    await controlarNombreDeOrganismo(tx, datos.nombre, id);
    const actual = await repositorio.bloquearOrganismo(tx, id);
    if (!actual) throw organismoNoEncontrado();
    if (datos.activo === false && actual.activo) await controlarBajaDeOrganismo(tx, id);
    return repositorio.actualizarOrganismo(tx, id, datos);
  });
  return { organismo };
}

/** Baja lógica. Dar de baja uno que ya está inactivo no hace nada. */
export async function darDeBajaOrganismo(parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  await repositorio.transaccion(async (tx) => {
    const organismo = await repositorio.bloquearOrganismo(tx, id);
    if (!organismo) throw organismoNoEncontrado();
    if (!organismo.activo) return;
    await controlarBajaDeOrganismo(tx, id);
    await repositorio.actualizarOrganismo(tx, id, { activo: false });
  });
}

export async function crearArea(cuerpo: unknown) {
  const datos = validar(esquemaAltaArea, cuerpo ?? {});
  const area = await repositorio.transaccion(async (tx) => {
    const organismo = await repositorio.bloquearOrganismo(tx, datos.organismoId);
    if (!organismo) throw organismoInvalido('No existe ese organismo');
    if (!organismo.activo) throw organismoInvalido('El organismo está inactivo');
    await controlarNombreDeArea(tx, organismo.id, datos.nombre);
    return repositorio.crearArea(tx, datos);
  });
  return { area };
}

/** El área, con su organismo bloqueado: el organismo primero, igual que en el alta, para no trabarse. */
async function bloquearArea(tx: repositorio.Tx, id: number) {
  const area = await repositorio.buscarAreaEn(tx, id);
  if (!area) throw areaNoEncontrada();
  const organismo = (await repositorio.bloquearOrganismo(tx, area.organismoId))!;
  // Se vuelve a leer ya con el lock: otro pudo cambiarla mientras se esperaba.
  return { area: (await repositorio.buscarAreaEn(tx, id))!, organismo };
}

export async function modificarArea(parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const datos = validar(esquemaModificacionArea, cuerpo ?? {});
  const area = await repositorio.transaccion(async (tx) => {
    const { area: actual, organismo } = await bloquearArea(tx, id);
    await controlarNombreDeArea(tx, organismo.id, datos.nombre, id);
    if (datos.activa === true && !actual.activa && !organismo.activo) {
      throw new ErrorApp(
        409,
        'ORGANISMO_INACTIVO',
        'El organismo está inactivo: primero hay que reactivarlo',
      );
    }
    if (datos.activa === false && actual.activa) await controlarBajaDeArea(tx, id);
    return repositorio.actualizarArea(tx, id, datos);
  });
  return { area };
}

/** Baja lógica. Dar de baja una que ya está inactiva no hace nada. */
export async function darDeBajaArea(parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  await repositorio.transaccion(async (tx) => {
    const { area } = await bloquearArea(tx, id);
    if (!area.activa) return;
    await controlarBajaDeArea(tx, id);
    await repositorio.actualizarArea(tx, id, { activa: false });
  });
}
