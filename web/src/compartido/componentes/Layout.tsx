import { Link, NavLink, Outlet } from 'react-router-dom';
import { useSesionPerdida } from '../red/clienteContexto.js';
import { useSesion } from '../sesion/sesionContexto.js';
import { esAdministrador, esOperador, esVecino } from '../sesion/usuario.js';
import type { Usuario } from '../sesion/usuario.js';

function seccionesDe(usuario: Usuario): { ruta: string; texto: string }[] {
  if (esVecino(usuario)) {
    return [
      { ruta: '/mapa', texto: 'Mapa' },
      { ruta: '/reportar', texto: 'Reportar' },
      { ruta: '/mis-reportes', texto: 'Mis reportes' },
    ];
  }
  if (esOperador(usuario)) return [{ ruta: '/bandeja', texto: 'Bandeja' }];
  if (esAdministrador(usuario)) return [{ ruta: '/administracion', texto: 'Administración' }];
  return [];
}

export function Layout() {
  const sesionPerdida = useSesionPerdida();
  const { estado, usuario, salir } = useSesion();
  const secciones = usuario ? seccionesDe(usuario) : [];

  return (
    <div className="flex min-h-dvh flex-col bg-superficie text-texto">
      <header className="border-b border-borde bg-superficie">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="text-xl font-semibold text-primario">
            SnapIt
          </Link>

          {estado === 'conSesion' ? (
            <nav className="flex items-center gap-1">
              <span className="hidden pr-2 text-sm text-texto-secundario sm:inline">{usuario?.nombre}</span>
              {secciones.map((seccion) => (
                <NavLink
                  key={seccion.ruta}
                  to={seccion.ruta}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-2 text-sm ${
                      isActive
                        ? 'bg-superficie-alterna font-semibold text-primario'
                        : 'text-texto-secundario hover:bg-superficie-alterna'
                    }`
                  }
                >
                  {seccion.texto}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => void salir()}
                className="rounded-md px-3 py-2 text-sm text-peligro hover:bg-superficie-alterna"
              >
                Salir
              </button>
            </nav>
          ) : (
            estado === 'sinSesion' && (
              <nav className="flex items-center gap-1">
                <Link
                  to="/ingreso"
                  className="rounded-md px-3 py-2 text-sm text-texto-secundario hover:bg-superficie-alterna"
                >
                  Ingresar
                </Link>
                <Link
                  to="/registro"
                  className="rounded-md bg-primario px-3 py-2 text-sm font-semibold text-sobre-primario hover:opacity-90"
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-borde bg-superficie">
        <div className="mx-auto w-full max-w-5xl px-4 py-3 text-sm text-texto-secundario">SnapIt</div>
      </footer>
    </div>
  );
}
