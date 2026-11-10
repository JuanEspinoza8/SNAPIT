import { Link } from 'react-router-dom';
import { useSesion } from '../sesion/sesionContexto.js';
import { esVecino } from '../sesion/usuario.js';

/**
 * El acceso a reportar un problema, en el inicio, el mapa y el perfil. Siempre va al formulario: sin sesión,
 * RutaProtegida lo manda a ingresar y después vuelve. Un operador o un administrador no reportan: no lo ven.
 */
export function BotonReportar() {
  const { estado, usuario } = useSesion();
  if (estado === 'cargando' || (usuario && !esVecino(usuario))) return null;

  return (
    <Link
      to="/reportar"
      title={usuario ? undefined : 'Ingresá para reportar un problema'}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primario px-4 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
    >
      {/* Dibujado a mano como los íconos de EtiquetaEstado: la web todavía no usa un set de íconos (E11). */}
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="h-3.5 w-3.5"
      >
        <path d="M6 2v8M2 6h8" />
      </svg>
      Reportar
    </Link>
  );
}
