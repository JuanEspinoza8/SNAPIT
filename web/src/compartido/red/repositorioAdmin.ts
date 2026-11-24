import type { Usuario } from '../sesion/usuario.js';
import type { ClienteApi } from './cliente.js';
import type {
  AreaAdmin,
  DatosAltaUsuario,
  DatosArea,
  DatosModificacionUsuario,
  DatosOrganismo,
  Organismo,
  OrganismoAdmin,
} from '../../funcionalidades/administracion/tipos.js';

type SinAreas<T> = Omit<T, 'areas'>;
type AreaGuardada = Omit<AreaAdmin, 'categoriasActivas'> & { organismoId: number };

export interface RepositorioAdmin {
  listarOrganismos(): Promise<{ organismos: Organismo[] }>;
  crearUsuario(datos: DatosAltaUsuario): Promise<{ usuario: Usuario }>;
  listarUsuarios(): Promise<{ usuarios: Usuario[] }>;
  modificarUsuario(id: number, datos: DatosModificacionUsuario): Promise<{ usuario: Usuario }>;
  /** Baja lógica: deja de poder ingresar, pero lo que hizo queda a su nombre. */
  darDeBaja(id: number): Promise<void>;
  /** Todos los organismos, también los dados de baja, con todas sus áreas. */
  listarOrganismosAdmin(): Promise<{ organismos: OrganismoAdmin[] }>;
  crearOrganismo(datos: DatosOrganismo): Promise<{ organismo: SinAreas<OrganismoAdmin> }>;
  modificarOrganismo(id: number, datos: DatosOrganismo): Promise<{ organismo: SinAreas<OrganismoAdmin> }>;
  darDeBajaOrganismo(id: number): Promise<void>;
  crearArea(datos: DatosArea & { organismoId: number }): Promise<{ area: AreaGuardada }>;
  modificarArea(id: number, datos: DatosArea): Promise<{ area: AreaGuardada }>;
  darDeBajaArea(id: number): Promise<void>;
}

// Todas las rutas de /api/admin son autenticadas y solo para administradores
// (docs/api.md): no llevan sinSesion, así que un 401 renueva la sesión como
// corresponde y un 403 de SIN_PERMISO se devuelve tal cual.
export function crearRepositorioAdmin(cliente: ClienteApi): RepositorioAdmin {
  return {
    listarOrganismos() {
      return cliente.pedir('/admin/organismos');
    },
    crearUsuario(datos) {
      return cliente.pedir('/admin/usuarios', { metodo: 'POST', cuerpo: datos });
    },
    listarUsuarios() {
      return cliente.pedir('/admin/usuarios');
    },
    modificarUsuario(id, datos) {
      return cliente.pedir(`/admin/usuarios/${id}`, { metodo: 'PUT', cuerpo: datos });
    },
    async darDeBaja(id) {
      await cliente.pedir(`/admin/usuarios/${id}`, { metodo: 'DELETE' });
    },
    listarOrganismosAdmin() {
      return cliente.pedir('/admin/organismos?todos=true');
    },
    crearOrganismo(datos) {
      return cliente.pedir('/admin/organismos', { metodo: 'POST', cuerpo: datos });
    },
    modificarOrganismo(id, datos) {
      return cliente.pedir(`/admin/organismos/${id}`, { metodo: 'PUT', cuerpo: datos });
    },
    async darDeBajaOrganismo(id) {
      await cliente.pedir(`/admin/organismos/${id}`, { metodo: 'DELETE' });
    },
    crearArea(datos) {
      return cliente.pedir('/admin/areas', { metodo: 'POST', cuerpo: datos });
    },
    modificarArea(id, datos) {
      return cliente.pedir(`/admin/areas/${id}`, { metodo: 'PUT', cuerpo: datos });
    },
    async darDeBajaArea(id) {
      await cliente.pedir(`/admin/areas/${id}`, { metodo: 'DELETE' });
    },
  };
}
