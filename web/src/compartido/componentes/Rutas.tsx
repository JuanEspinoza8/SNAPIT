import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './Layout.js';
import { Inicio } from '../../funcionalidades/Inicio.js';
import { PaginaSalud } from '../../funcionalidades/salud/paginaSalud.js';
import { PaginaIngreso } from '../../funcionalidades/cuenta/paginaIngreso.js';
import { PaginaRegistro } from '../../funcionalidades/cuenta/paginaRegistro.js';
import { PaginaConfirmarCorreo } from '../../funcionalidades/cuenta/paginaConfirmarCorreo.js';
import { PaginaRecuperarClave } from '../../funcionalidades/cuenta/paginaRecuperarClave.js';
import { PaginaRestablecerClave } from '../../funcionalidades/cuenta/paginaRestablecerClave.js';
import { SeccionEnConstruccion } from '../../funcionalidades/comun/SeccionEnConstruccion.js';
import { RutaProtegida, RutaSoloSinSesion } from './RutaProtegida.js';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Inicio /> },
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
      {
        path: 'mapa',
        element: (
          <RutaProtegida rol="VECINO">
            <SeccionEnConstruccion titulo="Mapa" />
          </RutaProtegida>
        ),
      },
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
            <SeccionEnConstruccion titulo="Administración" />
          </RutaProtegida>
        ),
      },
    ],
  },
]);
