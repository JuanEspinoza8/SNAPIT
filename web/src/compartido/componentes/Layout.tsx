import { Link, NavLink, Outlet } from 'react-router-dom';
import { useSesionPerdida } from '../red/clienteContexto.js';
import { useSesion } from '../sesion/sesionContexto.js';
import { esAdministrador, esOperador, esVecino } from '../sesion/usuario.js';
import type { Usuario } from '../sesion/usuario.js';
import { useTema } from '../tema/tema.js';
import { AvisoFlotante } from './AvisoFlotante.js';
import logo from '../../assets/logo.png';

// El inicio (el feed) y el mapa son públicos: están en el menú de todos los roles y también sin sesión.
const INICIO = { ruta: '/', texto: 'Inicio' };
const MAPA = { ruta: '/mapa', texto: 'Mapa' };

interface Seccion {
  ruta: string;
  texto: string;
  /** Para el lector de pantalla y el cartel del mouse, cuando el texto solo no dice adónde lleva. */
  etiqueta?: string;
}

// El perfil propio, con el nombre del usuario: todos los roles con sesión. Para el vecino reemplaza a «Mis reportes»
// (sus reportes están ahí), y la etiqueta lo dice.
const perfil = (usuario: Usuario): Seccion => ({
  ruta: '/perfil',
  texto: usuario.nombre,
  etiqueta: `${usuario.nombre}: tu perfil${esVecino(usuario) ? ' y tus reportes' : ''}`,
});

function seccionesDe(usuario: Usuario): Seccion[] {
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
      { ruta: '/revision', texto: 'Revisión' },
      { ruta: '/incidentes', texto: 'Incidentes' },
      { ruta: '/administracion', texto: 'Administración' },
      perfil(usuario),
    ];
  }
  return [INICIO, MAPA];
}

/**
 * Los enlaces del menú: al pasar el mouse, el texto se oscurece y aparece una línea fina debajo, que crece desde el
 * centro. La sección activa la tiene fija. Sin movimiento si el sistema pide reducirlo.
 */
const ENLACE_MENU =
  'relative rounded-md px-3 py-2 text-sm transition-colors duration-200 ' +
  'after:pointer-events-none after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full ' +
  'after:bg-texto after:transition-transform after:duration-300 after:ease-out motion-reduce:after:transition-none';
const ENLACE_INACTIVO = 'text-texto-secundario after:scale-x-0 hover:text-texto hover:after:scale-x-100';
const ENLACE_ACTIVO = 'font-semibold text-texto after:scale-x-100';

/** Pasa del tema oscuro al claro y al revés. Dice a cuál lleva, no en cuál está. Al pasar el mouse, gira. */
function BotonTema() {
  const { tema, alternar } = useTema();
  const otro = tema === 'oscuro' ? 'claro' : 'oscuro';
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={`Usar el tema ${otro}`}
      title={`Usar el tema ${otro}`}
      className="group rounded-md px-3 py-2 text-sm text-texto-secundario transition-colors duration-200 hover:bg-superficie-alterna hover:text-texto"
    >
      <span
        aria-hidden="true"
        className="inline-block transition-transform duration-300 ease-out motion-safe:group-hover:rotate-45"
      >
        {tema === 'oscuro' ? '☀' : '☾'}
      </span>
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
          <Link
            to="/"
            className="rounded-md transition-opacity duration-200 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-primario"
          >
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
                  aria-label={seccion.etiqueta}
                  title={seccion.etiqueta}
                  // El nombre puede tener hasta 120 caracteres: se recorta para no salirse del ancho de un
                  // celular. Los demás textos del menú entran sobrados.
                  className={({ isActive }) =>
                    `${ENLACE_MENU} max-w-40 truncate sm:max-w-64 ${isActive ? ENLACE_ACTIVO : ENLACE_INACTIVO}`
                  }
                >
                  {seccion.texto}
                </NavLink>
              ))}
              <BotonTema />
              <button
                type="button"
                onClick={() => void salir()}
                className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-peligro transition-colors duration-200 hover:bg-peligro/10"
              >
                Salir
              </button>
            </nav>
          ) : (
            estado === 'sinSesion' && (
              <nav className="flex flex-wrap items-center gap-1">
                <Link to={INICIO.ruta} className={`${ENLACE_MENU} ${ENLACE_INACTIVO} whitespace-nowrap`}>
                  {INICIO.texto}
                </Link>
                <Link to={MAPA.ruta} className={`${ENLACE_MENU} ${ENLACE_INACTIVO} whitespace-nowrap`}>
                  {MAPA.texto}
                </Link>
                <BotonTema />
                <Link to="/ingreso" className={`${ENLACE_MENU} ${ENLACE_INACTIVO} whitespace-nowrap`}>
                  Ingresar
                </Link>
                <Link
                  to="/registro"
                  className="whitespace-nowrap rounded-md bg-primario px-3 py-2 text-sm font-semibold text-sobre-primario transition duration-200 hover:opacity-90 hover:shadow-md motion-safe:hover:-translate-y-px"
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

      <AvisoFlotante />

      <main className={`mx-auto w-full ${ANCHO} flex-1 px-4 py-6`}>
        <Outlet />
      </main>

      <footer className="border-t border-borde bg-superficie">
        <div className={`mx-auto w-full ${ANCHO} px-4 py-3 text-sm text-texto-secundario`}>SnapIt</div>
      </footer>
    </div>
  );
}
