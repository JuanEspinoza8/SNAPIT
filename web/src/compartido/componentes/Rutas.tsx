import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { Layout } from './Layout.js';
import { PaginaSalud } from '../../funcionalidades/salud/paginaSalud.js';
import { PaginaIngreso } from '../../funcionalidades/cuenta/paginaIngreso.js';
import { PaginaRegistro } from '../../funcionalidades/cuenta/paginaRegistro.js';
import { PaginaConfirmarCorreo } from '../../funcionalidades/cuenta/paginaConfirmarCorreo.js';
import { PaginaRecuperarClave } from '../../funcionalidades/cuenta/paginaRecuperarClave.js';
import { PaginaRestablecerClave } from '../../funcionalidades/cuenta/paginaRestablecerClave.js';
import { SeccionEnConstruccion } from '../../funcionalidades/comun/SeccionEnConstruccion.js';
import { PaginaAltaOperador } from '../../funcionalidades/administracion/paginaAltaOperador.js';
import { PaginaMapa } from '../../funcionalidades/mapa/PaginaMapa.js';
import { RutaProtegida, RutaSoloSinSesion } from './RutaProtegida.js';

// Se exportan aparte del router para poder probarlas con un router en memoria.
export const rutas: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/mapa" replace /> },
      { path: 'salud', element: <PaginaSalud /> },
      {
        path: 'ingreso',
        element: (
          <RutaSoloSinSesion>
            <PaginaIngreso />
          </RutaSoloSinSesion>
        ),
      },
      {
        path: 'registro',
        element: (
          <RutaSoloSinSesion>
            <PaginaRegistro />
          </RutaSoloSinSesion>
        ),
      },
      {
        path: 'confirmar-correo',
        element: (
          <RutaSoloSinSesion>
            <PaginaConfirmarCorreo />
          </RutaSoloSinSesion>
        ),
      },
      {
        path: 'recuperar-clave',
        element: (
          <RutaSoloSinSesion>
            <PaginaRecuperarClave />
          </RutaSoloSinSesion>
        ),
      },
      {
        path: 'restablecer-clave',
        element: (
          <RutaSoloSinSesion>
            <PaginaRestablecerClave />
          </RutaSoloSinSesion>
        ),
      },
      // El mapa es público (F03): lo ve cualquiera, con o sin sesión y de cualquier rol.
      { path: 'mapa', element: <PaginaMapa /> },
      {
        path: 'reportar',
        element: (
          <RutaProtegida rol="VECINO">
            <SeccionEnConstruccion titulo="Reportar" />
          </RutaProtegida>
        ),
      },
      {
        path: 'mis-reportes',
        element: (
          <RutaProtegida rol="VECINO">
            <SeccionEnConstruccion titulo="Mis reportes" />
          </RutaProtegida>
        ),
      },
      {
        path: 'bandeja',
        element: (
          <RutaProtegida rol="OPERADOR">
            <SeccionEnConstruccion titulo="Bandeja" />
          </RutaProtegida>
        ),
      },
      {
        path: 'administracion',
        element: (
          <RutaProtegida rol="ADMINISTRADOR">
            <PaginaAltaOperador />
          </RutaProtegida>
        ),
      },
    ],
  },
];

export const router = createBrowserRouter(rutas);
