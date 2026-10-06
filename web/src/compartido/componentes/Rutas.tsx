import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './Layout.js';
import { Inicio } from '../../funcionalidades/Inicio.js';
import { PaginaMapa } from '../../funcionalidades/mapa/PaginaMapa.js';
import { PaginaSalud } from '../../funcionalidades/salud/paginaSalud.js';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Inicio /> },
      { path: 'mapa', element: <PaginaMapa /> },
      { path: 'salud', element: <PaginaSalud /> },
    ],
  },
]);
