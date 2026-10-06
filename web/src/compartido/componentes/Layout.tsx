import { Link, Outlet } from 'react-router-dom';
import { useSesionPerdida } from '../red/clienteContexto.js';

export function Layout() {
  const sesionPerdida = useSesionPerdida();

  return (
    <div className="flex min-h-dvh flex-col bg-superficie text-texto">
      <header className="border-b border-borde bg-superficie">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-semibold text-primario">
            SnapIt
          </Link>
          <Link
            to="/salud"
            className="rounded-md px-3 py-2 text-sm text-texto-secundario hover:bg-superficie-alterna"
          >
            Estado del servidor
          </Link>
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
