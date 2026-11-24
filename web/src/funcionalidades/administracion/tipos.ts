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

// Organismos y áreas para administrarlos (`GET /api/admin/organismos?todos=true`, #165): también los dados de
// baja, con su descripción. `categoriasActivas` dice si el área se puede dar de baja.
export interface AreaAdmin {
  id: number;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  creadoEn: string;
  categoriasActivas: number;
}

export interface OrganismoAdmin {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  creadoEn: string;
  areas: AreaAdmin[];
}

/** Alta y modificación de un organismo. Sin `activo`, queda como está; con true se reactiva. */
export interface DatosOrganismo {
  nombre: string;
  descripcion: string | null;
  activo?: boolean;
}

/** Modificación de un área. Su organismo no cambia. */
export interface DatosArea {
  nombre: string;
  descripcion: string | null;
  activa?: boolean;
}
