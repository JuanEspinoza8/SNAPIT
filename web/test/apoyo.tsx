import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';

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
