import { createContext, use, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAlmacen, useCliente, useRestablecerSesion, useSesionPerdida } from '../red/clienteContexto.js';
import { aErrorApi } from '../red/error.js';
import type { ErrorApi } from '../red/error.js';
import { crearRepositorioAuth } from '../red/repositorioAuth.js';
import type { Usuario } from './usuario.js';

type EstadoSesion = 'cargando' | 'error' | 'sinSesion' | 'conSesion';

interface ValorContexto {
  estado: EstadoSesion;
  usuario: Usuario | null;
  /** Por qué no se pudo saber quién es (estado `error`). */
  error: ErrorApi | null;
  reintentar(): void;
  guardarSesion(usuario: Usuario): void;
  salir(): Promise<void>;
}

const Contexto = createContext<ValorContexto | null>(null);

// undefined = todavía cargando quién es, null = sin sesión.
type SesionCargada = Usuario | null | undefined;

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const cliente = useCliente();
  const almacen = useAlmacen();
  const sesionPerdida = useSesionPerdida();
  const restablecerSesion = useRestablecerSesion();
  const repositorio = useMemo(() => crearRepositorioAuth(cliente), [cliente]);

  // undefined queda únicamente en la primera render de una recarga que tiene
  // tokens guardados: el guard muestra el skeleton hasta que /auth/yo contesta.
  const [usuario, setUsuario] = useState<SesionCargada>(() => (almacen.leer() ? undefined : null));
  const [error, setError] = useState<ErrorApi | null>(null);
  const [intento, setIntento] = useState(0);

  // Al abrir o recargar: si hay tokens guardados, se consulta quién es. La
  // renovación automática la hace el cliente si el token de acceso venció.
  useEffect(() => {
    if (!almacen.leer()) return;
    let activo = true;
    repositorio
      .yo()
      .then((respuesta) => {
        if (activo) setUsuario(respuesta.usuario);
      })
      .catch((causa: unknown) => {
        if (!activo) return;
        // Si el servidor rechazó la sesión, el cliente ya borró los tokens. Si
        // siguen guardados, no se pudo preguntar (sin red o servidor caído): se
        // ofrece reintentar sin pedir la clave, igual que la app.
        if (almacen.leer()) setError(aErrorApi(causa));
        else setUsuario(null);
      });
    return () => {
      activo = false;
    };
  }, [almacen, repositorio, intento]);

  function reintentar() {
    setError(null);
    if (almacen.leer()) setIntento((anterior) => anterior + 1);
    else setUsuario(null);
  }

  function guardarSesion(nuevo: Usuario) {
    // Después de volver a ingresar ya no se muestra el aviso de sesión vencida.
    restablecerSesion();
    setError(null);
    setUsuario(nuevo);
  }

  async function salir() {
    const tokens = almacen.leer();
    setUsuario(null);
    almacen.borrar();
    if (tokens) {
      try {
        await repositorio.salir(tokens.tokenRenovacion);
      } catch {
        // El servidor no respondió: localmente la sesión ya quedó cerrada.
      }
    }
  }

  // Derivado en cada render: el aviso del cliente de "sesión vencida" pisa la
  // sesión cargada sin necesidad de un efecto que sincronice estados.
  const estado: EstadoSesion = sesionPerdida
    ? 'sinSesion'
    : error
      ? 'error'
      : usuario === undefined
        ? 'cargando'
        : usuario === null
          ? 'sinSesion'
          : 'conSesion';

  return (
    <Contexto
      value={{
        estado,
        usuario: estado === 'conSesion' ? (usuario ?? null) : null,
        error: estado === 'error' ? error : null,
        reintentar,
        guardarSesion,
        salir,
      }}
    >
      {children}
    </Contexto>
  );
}

export function useSesion(): ValorContexto {
  const valor = use(Contexto);
  if (!valor) throw new Error('useSesion se usa solo dentro de ProveedorSesion');
  return valor;
}
