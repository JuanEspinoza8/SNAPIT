import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { inicioSegunRol } from '../sesion/usuario.js';
import type { Rol } from '../sesion/usuario.js';
import { useSesion } from '../sesion/sesionContexto.js';
import { Cargando } from './Cargando.js';

interface PropsProtegida {
  rol?: Rol;
  children: ReactNode;
}

export function RutaProtegida({ rol, children }: PropsProtegida) {
  const { estado, usuario } = useSesion();
  if (estado === 'cargando') return <Cargando />;
  if (estado === 'sinSesion') return <Navigate to="/ingreso" replace />;
  if (usuario && rol && usuario.rol !== rol) return <Navigate to={inicioSegunRol(usuario)} replace />;
  return children;
}

/** Para los formularios de cuenta: un usuario logueado no los ve. */
export function RutaSoloSinSesion({ children }: { children: ReactNode }) {
  const { estado, usuario } = useSesion();
  if (estado === 'cargando') return <Cargando />;
  if (usuario) return <Navigate to={inicioSegunRol(usuario)} replace />;
  return children;
}
