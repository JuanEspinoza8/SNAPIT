import type { Usuario } from '../sesion/usuario.js';
import type { ClienteApi } from './cliente.js';
import type {
  DatosAltaUsuario,
  DatosModificacionUsuario,
  Organismo,
} from '../../funcionalidades/administracion/tipos.js';

export interface RepositorioAdmin {
  listarOrganismos(): Promise<{ organismos: Organismo[] }>;
  crearUsuario(datos: DatosAltaUsuario): Promise<{ usuario: Usuario }>;
  listarUsuarios(): Promise<{ usuarios: Usuario[] }>;
  modificarUsuario(id: number, datos: DatosModificacionUsuario): Promise<{ usuario: Usuario }>;
  /** Baja lógica: deja de poder ingresar, pero lo que hizo queda a su nombre. */
  darDeBaja(id: number): Promise<void>;
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
  };
}
