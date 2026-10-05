import type { RolUsuario } from '@prisma/client';
import { prisma } from '../../compartido/prisma.js';

export function buscarOrganismo(id: number) {
  return prisma.organismo.findUnique({ where: { id } });
}

export function buscarArea(id: number) {
  return prisma.area.findUnique({ where: { id } });
}

export function crearUsuario(datos: {
  email: string;
  passwordHash: string;
  nombre: string;
  rol: RolUsuario;
  organismoId: number | null;
  areaId: number | null;
  emailVerificadoEn: Date;
}) {
  return prisma.usuario.create({ data: datos });
}

/** Organismos activos con sus áreas activas: lo que se puede elegir al dar de alta un operador. */
export function listarOrganismosActivos() {
  return prisma.organismo.findMany({
    where: { activo: true },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      nombre: true,
      areas: {
        where: { activa: true },
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        select: { id: true, nombre: true },
      },
    },
  });
}

/** Usuarios que no están dados de baja, de cualquier rol. */
export function listarUsuarios() {
  return prisma.usuario.findMany({
    where: { eliminadoEn: null },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
  });
}
