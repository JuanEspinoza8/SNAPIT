import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './compartido/componentes/Rutas.js';
import { ProveedorCliente } from './compartido/red/clienteContexto.js';
import { ProveedorSesion } from './compartido/sesion/sesionContexto.js';
import { usarSimulacion } from './config/entorno.js';
import '@fontsource-variable/inter';
import './estilos.css';

async function arrancar() {
  // Con DEV escrito acá, el build de producción descarta el simulador entero.
  if (import.meta.env.DEV && usarSimulacion) {
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
          <ProveedorSesion>
            <RouterProvider router={router} />
          </ProveedorSesion>
        </ProveedorCliente>
      </QueryClientProvider>
    </StrictMode>,
  );
}

arrancar();
