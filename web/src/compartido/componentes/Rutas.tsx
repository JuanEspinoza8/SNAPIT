import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './Layout.js';
import { Inicio } from '../../funcionalidades/Inicio.js';
import { PaginaSalud } from '../../funcionalidades/salud/paginaSalud.js';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Inicio /> },
      { path: 'salud', element: <PaginaSalud /> },
    ],
  },
]);
