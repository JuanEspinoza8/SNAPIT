import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';
import { ProveedorSesion } from '../src/compartido/sesion/sesionContexto.js';

/** Monta un elemento dentro del proveedor del cliente API y del enrutador,
 *  igual que arranca la aplicación en main.tsx. `estado` es el que deja otra
 *  pantalla al navegar (por ejemplo, el punto que manda «Ver en el mapa»). */
export function renderRuta(ruta: string, elemento: ReactElement, estado?: unknown) {
  const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={consulta}>
      <ProveedorCliente>
        <MemoryRouter initialEntries={[estado === undefined ? ruta : { pathname: ruta, state: estado }]}>
          <Routes>
            <Route path={ruta} element={elemento} />
          </Routes>
        </MemoryRouter>
      </ProveedorCliente>
    </QueryClientProvider>,
  );
}

/** Dónde quedó el enrutador, con los parámetros: para ver lo que una pantalla deja en la URL. */
function UbicacionActual() {
  const { pathname, search } = useLocation();
  return <span data-testid="ubicacion">{`${pathname}${search}`}</span>;
}

/** Con sesión (los tokens tienen que estar en localStorage y `/auth/yo` simulado) y varias rutas, para
 *  probar la navegación entre pantallas. */
export function renderConSesion(entrada: string, rutas: Record<string, ReactElement>) {
  const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={consulta}>
      <ProveedorCliente>
        <ProveedorSesion>
          <MemoryRouter initialEntries={[entrada]}>
            <Routes>
              {Object.entries(rutas).map(([ruta, elemento]) => (
                <Route key={ruta} path={ruta} element={elemento} />
              ))}
            </Routes>
            <UbicacionActual />
          </MemoryRouter>
        </ProveedorSesion>
      </ProveedorCliente>
    </QueryClientProvider>,
  );
}
