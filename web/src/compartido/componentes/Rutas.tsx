import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { Cargando } from './Cargando.js';
import { Layout } from './Layout.js';
import { PaginaSalud } from '../../funcionalidades/salud/paginaSalud.js';
import { PaginaIngreso } from '../../funcionalidades/cuenta/paginaIngreso.js';
import { PaginaRegistro } from '../../funcionalidades/cuenta/paginaRegistro.js';
import { PaginaConfirmarCorreo } from '../../funcionalidades/cuenta/paginaConfirmarCorreo.js';
import { PaginaRecuperarClave } from '../../funcionalidades/cuenta/paginaRecuperarClave.js';
import { PaginaRestablecerClave } from '../../funcionalidades/cuenta/paginaRestablecerClave.js';
import { SeccionEnConstruccion } from '../../funcionalidades/comun/SeccionEnConstruccion.js';
import { PaginaAltaOperador } from '../../funcionalidades/administracion/paginaAltaOperador.js';
import { PaginaMisReportes } from '../../funcionalidades/misReportes/paginaMisReportes.js';
import { RutaProtegida, RutaSoloSinSesion } from './RutaProtegida.js';

// El mapa trae Leaflet, que es pesado: se baja recién cuando alguien abre /mapa.
const PaginaMapa = lazy(() =>
  import('../../funcionalidades/mapa/PaginaMapa.js').then((modulo) => ({ default: modulo.PaginaMapa })),
);

// Reportar también trae Leaflet (el mapa para marcar el punto): se baja al abrir /reportar.
const PaginaReportar = lazy(() =>
  import('../../funcionalidades/reportar/paginaReportar.js').then((modulo) => ({
    default: modulo.PaginaReportar,
  })),
);

// La revisión trae Leaflet (el mapa chico): se baja recién cuando un operador abre /revision.
const PaginaRevision = lazy(() =>
  import('../../funcionalidades/revision/paginaRevision.js').then((modulo) => ({
    default: modulo.PaginaRevision,
  })),
);

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
      {
        path: 'mapa',
        element: (
          <Suspense fallback={<Cargando />}>
            <PaginaMapa />
          </Suspense>
        ),
      },
      {
        path: 'reportar',
        element: (
          <RutaProtegida rol="VECINO">
            <Suspense fallback={<Cargando />}>
              <PaginaReportar />
            </Suspense>
          </RutaProtegida>
        ),
      },
      {
        path: 'mis-reportes',
        element: (
          <RutaProtegida rol="VECINO">
            <PaginaMisReportes />
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
      // Revisión de los reportes de baja confianza (#52). La bandeja de incidentes por prioridad es la #67.
      {
        path: 'revision',
        element: (
          <RutaProtegida rol="OPERADOR">
            <Suspense fallback={<Cargando />}>
              <PaginaRevision />
            </Suspense>
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
