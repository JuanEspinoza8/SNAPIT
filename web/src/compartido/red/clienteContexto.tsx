import { createContext, use, useState } from 'react';
import type { ReactNode } from 'react';
import { crearClienteApi } from './cliente.js';
import type { ClienteApi } from './cliente.js';
import { crearAlmacenSesion } from './sesion.js';
import type { AlmacenSesion } from './sesion.js';
import { apiUrl } from '../../config/entorno.js';

interface ValorContexto {
  cliente: ClienteApi;
  almacen: AlmacenSesion;
  sesionPerdida: boolean;
  /** Se llama al volver a ingresar: ya no hay sesión que haya vencido. */
  restablecerSesion(): void;
}

const Contexto = createContext<ValorContexto | null>(null);

export function ProveedorCliente({ children }: { children: ReactNode }) {
  const [almacen] = useState(crearAlmacenSesion);
  const [sesionPerdida, setSesionPerdida] = useState(false);

  const [cliente] = useState(() =>
    crearClienteApi({
      urlBase: apiUrl,
      almacen,
      alPerderSesion: () => setSesionPerdida(true),
    }),
  );

  function restablecerSesion() {
    setSesionPerdida(false);
  }

  return <Contexto value={{ cliente, almacen, sesionPerdida, restablecerSesion }}>{children}</Contexto>;
}

export function useCliente(): ClienteApi {
  const valor = use(Contexto);
  if (!valor) throw new Error('useCliente se usa solo dentro de ProveedorCliente');
  return valor.cliente;
}

export function useAlmacen(): AlmacenSesion {
  const valor = use(Contexto);
  if (!valor) throw new Error('useAlmacen se usa solo dentro de ProveedorCliente');
  return valor.almacen;
}

export function useSesionPerdida(): boolean {
  const valor = use(Contexto);
  if (!valor) throw new Error('useSesionPerdida se usa solo dentro de ProveedorCliente');
  return valor.sesionPerdida;
}

export function useRestablecerSesion(): () => void {
  const valor = use(Contexto);
  if (!valor) throw new Error('useRestablecerSesion se usa solo dentro de ProveedorCliente');
  return valor.restablecerSesion;
}
