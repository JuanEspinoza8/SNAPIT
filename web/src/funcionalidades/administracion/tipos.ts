// Lo que da de alta un administrador: operadores y administradores (los
// vecinos se registran solos). Son los mismos datos que pide el servidor en
// `POST /api/admin/usuarios` (server/src/modulos/admin/esquemas.ts).

export interface Area {
  id: number;
  nombre: string;
}

export interface Organismo {
  id: number;
  nombre: string;
  areas: Area[];
}

export type RolDeAlta = 'OPERADOR' | 'ADMINISTRADOR';

export type DatosAltaUsuario =
  | { email: string; clave: string; nombre: string; rol: 'OPERADOR'; organismoId: number; areaId: number }
  | {
      email: string;
      clave: string;
      nombre: string;
      rol: 'ADMINISTRADOR';
      organismoId: number | null;
      areaId: null;
    };
