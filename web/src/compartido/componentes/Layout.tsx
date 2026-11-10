import { Link, NavLink, Outlet } from 'react-router-dom';
import { useSesionPerdida } from '../red/clienteContexto.js';
import { useSesion } from '../sesion/sesionContexto.js';
import { esAdministrador, esOperador, esVecino } from '../sesion/usuario.js';
import type { Usuario } from '../sesion/usuario.js';
import { useTema } from '../tema/tema.js';
import logo from '../../assets/logo.png';

// El inicio (el feed) y el mapa son públicos: están en el menú de todos los roles y también sin sesión.
const INICIO = { ruta: '/', texto: 'Inicio' };
const MAPA = { ruta: '/mapa', texto: 'Mapa' };
// El perfil propio, con el nombre del usuario: todos los roles con sesión. Para el vecino reemplaza a «Mis reportes»
// (sus reportes están ahí).
const perfil = (usuario: Usuario) => ({ ruta: '/perfil', texto: usuario.nombre });

function seccionesDe(usuario: Usuario): { ruta: string; texto: string }[] {
  if (esVecino(usuario)) {
    // Reportar no va en el menú: está el botón «+ Reportar» en el inicio y en el mapa.
    return [INICIO, MAPA, perfil(usuario)];
  }
  if (esOperador(usuario)) {
    return [
      INICIO,
      MAPA,
      { ruta: '/bandeja', texto: 'Bandeja' },
      { ruta: '/revision', texto: 'Revisión' },
      { ruta: '/incidentes', texto: 'Incidentes' },
      perfil(usuario),
    ];
  }
  if (esAdministrador(usuario)) {
    return [
      INICIO,
      MAPA,
      { ruta: '/bandeja', texto: 'Bandeja' },
      { ruta: '/administracion', texto: 'Administración' },
      perfil(usuario),
    ];
  }
  return [INICIO, MAPA];
}

/** Pasa del tema oscuro al claro y al revés. Dice a cuál lleva, no en cuál está. */
function BotonTema() {
  const { tema, alternar } = useTema();
  const otro = tema === 'oscuro' ? 'claro' : 'oscuro';
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={`Usar el tema ${otro}`}
      title={`Usar el tema ${otro}`}
      className="rounded-md px-3 py-2 text-sm text-texto-secundario hover:bg-superficie-alterna"
    >
      <span aria-hidden="true">{tema === 'oscuro' ? '☀' : '☾'}</span>
    </button>
  );
}

// Todo el ancho de la pantalla, hasta 1536 px. Los formularios de la cuenta tienen su propio límite (max-w-md).
const ANCHO = 'max-w-screen-2xl';

export function Layout() {
  const sesionPerdida = useSesionPerdida();
  const { estado, usuario, salir } = useSesion();
  const secciones = usuario ? seccionesDe(usuario) : [];

  return (
    <div className="flex min-h-dvh flex-col bg-superficie text-texto">
      <header className="border-b border-borde bg-superficie">
        <div
          className={`mx-auto flex w-full ${ANCHO} flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3`}
        >
          <Link to="/" className="rounded-md focus-visible:outline-2 focus-visible:outline-primario">
            {/* El logo ya trae su fondo negro: se lee igual en el tema claro y en el oscuro. */}
            <img src={logo} alt="SnapIt, ir al inicio" className="h-9 w-auto" />
          </Link>

          {estado === 'conSesion' ? (
            <nav className="flex flex-wrap items-center gap-1">
              {secciones.map((seccion) => (
                <NavLink
                  key={seccion.ruta}
                  to={seccion.ruta}
                  // Sin `end`, «Inicio» (/) quedaría marcado en todas las páginas.
                  end={seccion.ruta === '/'}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-md px-3 py-2 text-sm ${
                      isActive
                        ? 'bg-superficie-alterna font-semibold text-primario'
                        : 'text-texto-secundario hover:bg-superficie-alterna'
                    }`
                  }
                >
                  {seccion.texto}
                </NavLink>
              ))}
              <BotonTema />
              <button
                type="button"
                onClick={() => void salir()}
                className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-peligro hover:bg-superficie-alterna"
              >
                Salir
              </button>
            </nav>
          ) : (
            estado === 'sinSesion' && (
              <nav className="flex flex-wrap items-center gap-1">
                <Link
                  to={INICIO.ruta}
                  className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-texto-secundario hover:bg-superficie-alterna"
                >
                  {INICIO.texto}
                </Link>
                <Link
                  to={MAPA.ruta}
                  className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-texto-secundario hover:bg-superficie-alterna"
                >
                  {MAPA.texto}
                </Link>
                <BotonTema />
                <Link
                  to="/ingreso"
                  className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-texto-secundario hover:bg-superficie-alterna"
                >
                  Ingresar
                </Link>
                <Link
                  to="/registro"
                  className="whitespace-nowrap rounded-md bg-primario px-3 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
                >
                  Registrarse
                </Link>
              </nav>
            )
          )}
        </div>
      </header>

      {sesionPerdida && (
        <div
          role="alert"
          className="border-b border-peligro bg-superficie-alterna px-4 py-3 text-sm text-peligro"
        >
          Tu sesión venció. Volvé a ingresar.
        </div>
      )}

      <main className={`mx-auto w-full ${ANCHO} flex-1 px-4 py-6`}>
        <Outlet />
      </main>

      <footer className="border-t border-borde bg-superficie">
        <div className={`mx-auto w-full ${ANCHO} px-4 py-3 text-sm text-texto-secundario`}>SnapIt</div>
      </footer>
    </div>
  );
}
