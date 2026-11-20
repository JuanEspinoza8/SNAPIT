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

// El operador puede no tener área: entonces ve todo su organismo.
export type DatosAltaUsuario =
  | {
      email: string;
      clave: string;
      nombre: string;
      rol: 'OPERADOR';
      organismoId: number;
      areaId: number | null;
    }
  | {
      email: string;
      clave: string;
      nombre: string;
      rol: 'ADMINISTRADOR';
      organismoId: number | null;
      areaId: null;
    };

/** Lo que se cambia de un usuario (`PUT /api/admin/usuarios/:id`): el correo y la clave son de cada uno. */
export type DatosModificacionUsuario =
  | { nombre: string; rol: 'VECINO'; organismoId: null; areaId: null }
  | { nombre: string; rol: 'OPERADOR'; organismoId: number; areaId: number | null }
  | { nombre: string; rol: 'ADMINISTRADOR'; organismoId: number | null; areaId: null };
