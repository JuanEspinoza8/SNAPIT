export type Rol = 'VECINO' | 'OPERADOR' | 'ADMINISTRADOR';

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  organismoId: number | null;
  areaId: number | null;
}

export function esVecino(usuario: Usuario): boolean {
  return usuario.rol === 'VECINO';
}

export function esOperador(usuario: Usuario): boolean {
  return usuario.rol === 'OPERADOR';
}

export function esAdministrador(usuario: Usuario): boolean {
  return usuario.rol === 'ADMINISTRADOR';
}

/** La primera sección a la que entra cada rol (issue #9). El vecino, al inicio (el feed), como en la app. */
export function inicioSegunRol(usuario: Usuario): string {
  if (esOperador(usuario)) return '/bandeja';
  if (esAdministrador(usuario)) return '/administracion';
  return '/';
}
