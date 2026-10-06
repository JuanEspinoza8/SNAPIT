import { createContext, use, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAlmacen, useCliente, useRestablecerSesion, useSesionPerdida } from '../red/clienteContexto.js';
import { crearRepositorioAuth } from '../red/repositorioAuth.js';
import type { Usuario } from './usuario.js';

type EstadoSesion =
  { estado: 'cargando' } | { estado: 'sinSesion' } | { estado: 'conSesion'; usuario: Usuario };

interface ValorContexto {
  estado: EstadoSesion['estado'];
  usuario: Usuario | null;
  /** Lo llama useIngreso después de guardar los tokens. */
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
  // tokens guardados: el guard muestra "Cargando…" hasta que /auth/yo contesta.
  const [usuario, setUsuario] = useState<SesionCargada>(() => (almacen.leer() ? undefined : null));

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
      .catch(() => {
        // Un 401 ya borró los tokens; sin conexión la sesión se considera
        // perdida hasta que arranque de nuevo la aplicación.
        if (activo) setUsuario(null);
      });
    return () => {
      activo = false;
    };
  }, [almacen, repositorio]);

  function guardarSesion(nuevo: Usuario) {
    // Después de volver a ingresar ya no se muestra el aviso de sesión vencida.
    restablecerSesion();
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
  const estado: EstadoSesion['estado'] = sesionPerdida
    ? 'sinSesion'
    : usuario === undefined
      ? 'cargando'
      : usuario === null
        ? 'sinSesion'
        : 'conSesion';

  return (
    <Contexto
      value={{
        estado,
        usuario: sesionPerdida ? null : (usuario ?? null),
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
