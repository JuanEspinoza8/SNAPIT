import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { destinoTrasIngreso, inicioSegunRol } from '../sesion/usuario.js';
import type { EstadoIngreso, Rol } from '../sesion/usuario.js';
import { useSesion } from '../sesion/sesionContexto.js';
import { AvisoError } from './AvisoError.js';
import { Cargando } from './Cargando.js';

interface PropsProtegida {
  /** Los roles que pueden entrar. Sin roles, alcanza con tener sesión. */
  roles?: Rol[];
  children: ReactNode;
}

export function RutaProtegida({ roles, children }: PropsProtegida) {
  const { estado, usuario, error, reintentar } = useSesion();
  const { pathname, search } = useLocation();
  if (estado === 'cargando') return <Cargando />;
  if (estado === 'error' && error) return <AvisoError error={error} alReintentar={reintentar} />;
  if (estado === 'sinSesion') {
    // Al ingresar vuelve acá (useIngreso), por ejemplo al formulario desde el botón «Reportar».
    const desde: EstadoIngreso = { desde: `${pathname}${search}` };
    return <Navigate to="/ingreso" replace state={desde} />;
  }
  if (usuario && roles && !roles.includes(usuario.rol)) {
    return <Navigate to={inicioSegunRol(usuario)} replace />;
  }
  return children;
}

/** Para los formularios de cuenta: un usuario logueado no los ve. */
export function RutaSoloSinSesion({ children }: { children: ReactNode }) {
  const { estado, usuario, error, reintentar } = useSesion();
  const { state } = useLocation();
  if (estado === 'cargando') return <Cargando />;
  if (estado === 'error' && error) return <AvisoError error={error} alReintentar={reintentar} />;
  // Recién ingresado, esta guarda se dibuja antes de que useIngreso termine de navegar: tiene que mandar al
  // mismo lugar, o pisa la vuelta a la página que se quiso abrir.
  if (usuario) return <Navigate to={destinoTrasIngreso(state, usuario)} replace />;
  return children;
}
