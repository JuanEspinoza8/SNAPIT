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

const PaginaBandeja = lazy(() =>
  import('../../funcionalidades/bandeja/paginaBandeja.js').then((modulo) => ({
    default: modulo.PaginaBandeja,
  })),
);
const PaginaFicha = lazy(() =>
  import('../../funcionalidades/bandeja/paginaFicha.js').then((modulo) => ({ default: modulo.PaginaFicha })),
);
const PaginaIncidentes = lazy(() =>
  import('../../funcionalidades/incidentes/paginaIncidentes.js').then((modulo) => ({
    default: modulo.PaginaIncidentes,
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
      // Los incidentes del organismo por prioridad (#67) y la ficha de cada uno con sus acciones (#68).
      {
        path: 'bandeja',
        element: (
          <RutaProtegida rol="OPERADOR">
            <Suspense fallback={<Cargando />}>
              <PaginaBandeja />
            </Suspense>
          </RutaProtegida>
        ),
      },
      {
        path: 'bandeja/:id',
        element: (
          <RutaProtegida rol="OPERADOR">
            <Suspense fallback={<Cargando />}>
              <PaginaFicha />
            </Suspense>
          </RutaProtegida>
        ),
      },
      // Revisión de los reportes de baja confianza (#52).
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
      // Corregir la agrupación: separar reportes y unir incidentes (#69).
      {
        path: 'incidentes',
        element: (
          <RutaProtegida rol="OPERADOR">
            <Suspense fallback={<Cargando />}>
              <PaginaIncidentes />
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
