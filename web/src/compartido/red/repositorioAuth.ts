import type { Usuario } from '../sesion/usuario.js';
import type { ClienteApi, OpcionesPeticion } from './cliente.js';

export interface Ingreso {
  tokenAcceso: string;
  tokenRenovacion: string;
  usuario: Usuario;
}

export interface RepositorioAuth {
  ingreso(email: string, clave: string): Promise<Ingreso>;
  registro(nombre: string, email: string, clave: string): Promise<{ usuario: Usuario }>;
  yo(): Promise<{ usuario: Usuario }>;
  salir(tokenRenovacion: string): Promise<void>;
  confirmarCorreo(token: string): Promise<void>;
  recuperarClave(email: string): Promise<void>;
  restablecerClave(token: string, clave: string): Promise<void>;
}

// Autenticarse y registrarse son peticiones públicas: el 401 de "credenciales
// inválidas" nunca tiene que disparar la renovación de una sesión.
const publico: OpcionesPeticion = { metodo: 'POST', sinSesion: true };

export function crearRepositorioAuth(cliente: ClienteApi): RepositorioAuth {
  return {
    ingreso(email, clave) {
      return cliente.pedir('/auth/ingreso', { ...publico, cuerpo: { email, clave } });
    },
    registro(nombre, email, clave) {
      return cliente.pedir('/auth/registro', { ...publico, cuerpo: { nombre, email, clave } });
    },
    yo() {
      // No es pública: pedir agrega el Bearer solo y renueva si el token venció.
      return cliente.pedir('/auth/yo');
    },
    salir(tokenRenovacion) {
      // Pública según docs/api.md: el cuerpo lleva el token de renovación.
      return cliente.pedir<void>('/auth/salir', { ...publico, cuerpo: { tokenRenovacion } });
    },
    confirmarCorreo(token) {
      return cliente.pedir<void>('/auth/confirmar-correo', { ...publico, cuerpo: { token } });
    },
    recuperarClave(email) {
      return cliente.pedir<void>('/auth/recuperar-clave', { ...publico, cuerpo: { email } });
    },
    restablecerClave(token, clave) {
      return cliente.pedir<void>('/auth/restablecer-clave', {
        ...publico,
        cuerpo: { token, clave },
      });
    },
  };
}
