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

/** Lo que RutaProtegida deja en la navegación al mandar al ingreso: la página que se quiso abrir. */
export interface EstadoIngreso {
  desde: string;
}

/**
 * Adónde va quien acaba de ingresar: a la página que quiso abrir sin sesión o, si no hay, al inicio de su rol.
 * Si esa página no es de su rol, RutaProtegida lo vuelve a mandar a su inicio.
 */
export function destinoTrasIngreso(estado: unknown, usuario: Usuario): string {
  const desde = (estado as Partial<EstadoIngreso> | null)?.desde;
  // Solo rutas de la propia web: «//otro.sitio» sería otra dirección.
  if (typeof desde === 'string' && desde.startsWith('/') && !desde.startsWith('//')) return desde;
  return inicioSegunRol(usuario);
}
