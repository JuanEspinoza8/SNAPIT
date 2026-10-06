import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProveedorCliente } from '../src/compartido/red/clienteContexto.js';

/** Monta un elemento dentro del proveedor del cliente API y del enrutador,
 *  igual que arranca la aplicación en main.tsx. */
export function renderRuta(ruta: string, elemento: ReactElement) {
  const consulta = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={consulta}>
      <ProveedorCliente>
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route path={ruta} element={elemento} />
          </Routes>
        </MemoryRouter>
      </ProveedorCliente>
    </QueryClientProvider>,
  );
}
