import bcrypt from 'bcryptjs';
import { type DetalleError, ErrorApp } from '../../compartido/errores.js';
import { COSTO_BCRYPT, usuarioPublico } from '../auth/servicio.js';
import type { DatosAltaUsuario } from './esquemas.js';
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

export async function listarUsuarios() {
  const usuarios = await repositorio.listarUsuarios();
  return { usuarios: usuarios.map(usuarioPublico) };
}
