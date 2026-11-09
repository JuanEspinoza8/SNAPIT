import { Link } from 'react-router-dom';
import { useSesionOpcional } from '../sesion/sesionContexto.js';
import { esVecino } from '../sesion/usuario.js';

/**
 * El acceso a reportar un problema, en el inicio y en el mapa. El vecino va al formulario; sin sesión, a
 * ingresar (reportar la pide). Un operador o un administrador no reportan: no lo ven.
 */
export function BotonReportar() {
  const sesion = useSesionOpcional();
  if (!sesion) return null;
  const { estado, usuario } = sesion;
  if (estado === 'cargando' || (usuario && !esVecino(usuario))) return null;
  const conSesion = usuario !== null;

  return (
    <Link
      to={conSesion ? '/reportar' : '/ingreso'}
      title={conSesion ? undefined : 'Ingresá para reportar un problema'}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
    >
      <span aria-hidden="true" className="text-base leading-none">
        +
      </span>
      Reportar
    </Link>
  );
}
