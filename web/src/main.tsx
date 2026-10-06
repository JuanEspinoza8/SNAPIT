import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './compartido/componentes/Rutas.js';
import { ProveedorCliente } from './compartido/red/clienteContexto.js';
import { usarSimulacion } from './config/entorno.js';
import './estilos.css';

async function arrancar() {
  if (usarSimulacion) {
    const { worker } = await import('./compartido/red/mocks/servidorSimulado.js');
    await worker.start({ onUnhandledFrame: 'bypass' });
  }

  const consulta = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  createRoot(document.getElementById('raiz')!).render(
    <StrictMode>
      <QueryClientProvider client={consulta}>
        <ProveedorCliente>
          <RouterProvider router={router} />
        </ProveedorCliente>
      </QueryClientProvider>
    </StrictMode>,
  );
}

arrancar();
