import { http, HttpResponse } from 'msw';
import type { Usuario } from '../../sesion/usuario.js';
import type { DatosAltaUsuario, Organismo } from '../../../funcionalidades/administracion/tipos.js';
import type { FichaIncidente, PuntoMapa } from '../../../funcionalidades/mapa/tipos.js';
import type { ReporteMio } from '../../../funcionalidades/misReportes/tipos.js';
import type { ReportePendiente, ResultadoRevision } from '../../../funcionalidades/revision/tipos.js';
import { apiUrl } from '../../../config/entorno.js';

const usuarioVecino: Usuario = {
  id: 2,
  email: 'vecino@ejemplo.com',
  nombre: 'Vecino',
  rol: 'VECINO',
  organismoId: null,
  areaId: null,
};

const usuarioAdministrador: Usuario = {
  id: 1,
  email: 'admin@ejemplo.com',
  nombre: 'Administración Municipal',
  rol: 'ADMINISTRADOR',
  organismoId: 1,
  areaId: null,
};

const usuarioOperador: Usuario = {
  id: 3,
  email: 'bacheo@ejemplo.com',
  nombre: 'Operador de Bacheo',
  rol: 'OPERADOR',
  organismoId: 1,
  areaId: 1,
};

// Los tres usuarios de prueba entran con la misma clave: cualquiera sirve en la
// simulación, la clave no se controla (salvo el correo "rechazado@ejemplo.com").
const sesionDe = (usuario: Usuario) => ({
  tokenAcceso: `acceso-${usuario.rol.toLowerCase()}`,
  tokenRenovacion: `renovacion-${usuario.rol.toLowerCase()}`,
  usuario,
});

const organismoMunicipalidad: Organismo = {
  id: 1,
  nombre: 'Municipalidad de Neuquén',
  areas: [
    { id: 1, nombre: 'Bacheo' },
    { id: 2, nombre: 'Veredas' },
    { id: 3, nombre: 'Alumbrado' },
  ],
};

const organismos: Organismo[] = [organismoMunicipalidad];

// Las categorías de la semilla, ordenadas por nombre como las devuelve GET /categorias
// (id y nombre alcanzan para el formulario).
const categorias = [
  { id: 3, nombre: 'Cordón sin rampa' },
  { id: 4, nombre: 'Luminaria apagada' },
  { id: 5, nombre: 'Obra que interrumpe el paso' },
  { id: 1, nombre: 'Pozo en la calzada' },
  { id: 2, nombre: 'Vereda rota' },
];

const nombreCategoria = (id: number) =>
  categorias.find((categoria) => categoria.id === id)?.nombre ?? 'Sin categoría';

// Incidentes que devuelve GET /incidentes. Arranca con uno de muestra y crece
// cuando POST /reportes suma uno: así el mapa público muestra lo que se reporta.
let incidentes: PuntoMapa[] = [
  {
    id: 1,
    lat: -38.9516,
    lon: -68.0591,
    categoriaId: 3,
    categoriaNombre: 'Cordón sin rampa',
    estado: 'REGISTRADO',
    enRevision: true,
    primerReporteEn: '2026-01-15T10:00:00.000Z',
    cantidadReportes: 1,
  },
  {
    id: 2,
    lat: -38.9544,
    lon: -68.0621,
    categoriaId: 1,
    categoriaNombre: 'Pozo en la calzada',
    estado: 'RESUELTO',
    enRevision: false,
    primerReporteEn: '2026-02-10T13:20:00.000Z',
    cantidadReportes: 1,
  },
];
let proximoIncidenteId = 3;

// Reportes del vecino que devuelve GET /reportes/mios, del más nuevo al más viejo.
// Cubren los tres casos de la pantalla: con ficha, sin incidente y desestimado.
let reportesMios: ReporteMio[] = [
  {
    id: 102,
    registradoEn: '2026-02-10T13:20:00.000Z',
    categoria: { id: 1, nombre: 'Pozo en la calzada' },
    severidadDeclarada: 'GRAVE',
    descripcion: 'Pozo hondo en la esquina, peligroso para las motos.',
    fotos: [{ id: 1, url: '/api/fotos/1' }],
    estadoVerificacion: 'VERIFICADO',
    incidente: { id: 2, estado: 'RESUELTO', enRevision: false },
  },
  {
    id: 101,
    registradoEn: '2026-01-28T09:05:00.000Z',
    categoria: { id: 4, nombre: 'Luminaria apagada' },
    severidadDeclarada: 'MODERADA',
    descripcion: null,
    fotos: [{ id: 2, url: '/api/fotos/2' }],
    estadoVerificacion: 'PENDIENTE_REVISION',
    incidente: null,
  },
  {
    id: 100,
    registradoEn: '2026-01-12T20:40:00.000Z',
    categoria: { id: 2, nombre: 'Vereda rota' },
    severidadDeclarada: 'LEVE',
    descripcion: 'Un par de baldosas levantadas.',
    fotos: [{ id: 3, url: '/api/fotos/3' }],
    estadoVerificacion: 'DESESTIMADO',
    incidente: { id: 5, estado: 'DESESTIMADO', enRevision: false },
  },
];
let proximoReporteId = 103;

// Reportes de baja confianza que devuelve GET /reportes/pendientes (F04),
// del más viejo al más nuevo, como los ordena el servidor.
let reportesPendientes: ReportePendiente[] = [
  {
    id: 12,
    registradoEn: '2026-10-16T14:20:00.000Z',
    categoria: { id: 3, nombre: 'Cordón sin rampa' },
    severidadDeclarada: 'MODERADA',
    descripcion: 'Rampa rota en el acceso de la escuela.',
    direccion: 'General Villegas 195, Villa Farrel',
    lat: -38.9531,
    lon: -68.0478,
    origen: 'SITIO_WEB',
    nivelConfianza: 40,
    senales: [
      {
        tipo: 'EXIF_AUSENTE',
        valor: -10,
        detalle: 'La foto se eligió de la galería y no trae la ubicación donde se sacó',
      },
      { tipo: 'REPUTACION', valor: 0, detalle: 'Reputación del vecino: 50 de 100' },
    ],
    fotos: [{ id: 1, url: '/api/fotos/1' }],
    incidente: { id: 9, estado: 'REGISTRADO', cantidadReportes: 1 },
    vecino: { reputacion: 50, reportesConfirmados: 0, reportesDesestimados: 0 },
  },
  {
    id: 15,
    registradoEn: '2026-10-17T09:10:00.000Z',
    categoria: { id: 1, nombre: 'Pozo en la calzada' },
    severidadDeclarada: 'GRAVE',
    descripcion: null,
    direccion: null,
    lat: -38.956,
    lon: -68.055,
    origen: 'APP_MOVIL',
    nivelConfianza: 0,
    senales: [
      { tipo: 'HASH_DUPLICADO', valor: -40, detalle: 'La misma foto ya se usó en otro reporte' },
      {
        tipo: 'EXIF_AUSENTE',
        valor: -10,
        detalle: 'La foto se eligió de la galería y no trae la ubicación donde se sacó',
      },
      { tipo: 'REPUTACION', valor: -20, detalle: 'Reputación del vecino: 0 de 100' },
    ],
    fotos: [{ id: 2, url: '/api/fotos/2' }],
    incidente: null,
    vecino: { reputacion: 0, reportesConfirmados: 0, reportesDesestimados: 3 },
  },
];

const FOTO_SIMULADA =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#D9DEE5"/></svg>';

// La lista de usuarios vive en memoria: al dar de alta uno nuevo se agrega acá
// y la pantalla lo muestra al refrescar la lista (GET /admin/usuarios).
let usuarios: Usuario[] = [usuarioAdministrador, usuarioVecino, usuarioOperador];
let proximoId = 4;

function usuarioPorAutorizacion(autorizacion: string): Usuario {
  if (autorizacion.includes('acceso-operador')) return usuarioOperador;
  if (autorizacion.includes('acceso-administrador')) return usuarioAdministrador;
  return usuarioVecino;
}

export const handlers = [
  http.get(`${apiUrl}/salud`, () => HttpResponse.json({ estado: 'ok', baseDeDatos: 'ok' })),

  http.post(`${apiUrl}/auth/ingreso`, async ({ request }) => {
    const cuerpo = (await request.json()) as { email?: string };
    if (cuerpo.email === 'rechazado@ejemplo.com') {
      return HttpResponse.json(
        { error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'El correo o la clave no son válidos.' } },
        { status: 401 },
      );
    }
    // Cada correo de prueba entra con un rol distinto.
    if (cuerpo.email === 'admin@ejemplo.com') {
      return HttpResponse.json(sesionDe(usuarioAdministrador));
    }
    if (cuerpo.email === 'operador@ejemplo.com' || cuerpo.email === 'bacheo@ejemplo.com') {
      return HttpResponse.json(sesionDe(usuarioOperador));
    }
    return HttpResponse.json(sesionDe(usuarioVecino));
  }),

  http.post(`${apiUrl}/auth/renovar`, async ({ request }) => {
    const cuerpo = (await request.json()) as { tokenRenovacion?: string };
    const rol = cuerpo.tokenRenovacion?.includes('operador')
      ? 'OPERADOR'
      : cuerpo.tokenRenovacion?.includes('administrador')
        ? 'ADMINISTRADOR'
        : 'VECINO';
    const usuario =
      rol === 'OPERADOR' ? usuarioOperador : rol === 'ADMINISTRADOR' ? usuarioAdministrador : usuarioVecino;
    return HttpResponse.json(sesionDe(usuario));
  }),

  http.post(`${apiUrl}/auth/registro`, () => HttpResponse.json({ usuario: usuarioVecino }, { status: 201 })),

  http.get(`${apiUrl}/auth/yo`, ({ request }) =>
    HttpResponse.json({ usuario: usuarioPorAutorizacion(request.headers.get('Authorization') ?? '') }),
  ),

  http.post(`${apiUrl}/auth/salir`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${apiUrl}/auth/confirmar-correo`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${apiUrl}/auth/recuperar-clave`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${apiUrl}/auth/restablecer-clave`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${apiUrl}/categorias`, () => HttpResponse.json({ categorias })),

  http.get(`${apiUrl}/incidentes`, () => HttpResponse.json({ incidentes })),

  http.get(`${apiUrl}/incidentes/:id`, ({ params }) => {
    const incidente = incidentes.find((item) => item.id === Number(params.id));
    if (!incidente) {
      return HttpResponse.json(
        { error: { codigo: 'INCIDENTE_NO_ENCONTRADO', mensaje: 'El incidente no existe' } },
        { status: 404 },
      );
    }
    return HttpResponse.json({
      id: incidente.id,
      lat: incidente.lat,
      lon: incidente.lon,
      categoria: { id: incidente.categoriaId, nombre: incidente.categoriaNombre },
      estado: incidente.estado,
      enRevision: incidente.enRevision,
      primerReporteEn: incidente.primerReporteEn,
      cantidadReportes: incidente.cantidadReportes,
      cantidadVecinos: 1,
      direccion: null,
      fotos: [],
    } satisfies FichaIncidente);
  }),

  http.get(`${apiUrl}/reportes/mios`, () => HttpResponse.json({ reportes: reportesMios })),

  // Cualquier foto es un recuadro gris. Sin sesión, la del reporte desestimado da 404, como en el servidor.
  http.get(`${apiUrl}/fotos/:id`, ({ params, request }) => {
    if (params.id === '3' && !request.headers.get('Authorization')) {
      return HttpResponse.json(
        { error: { codigo: 'FOTO_NO_ENCONTRADA', mensaje: 'La foto no existe' } },
        { status: 404 },
      );
    }
    return new HttpResponse(FOTO_SIMULADA, { headers: { 'Content-Type': 'image/svg+xml' } });
  }),

  http.get(`${apiUrl}/admin/organismos`, () => HttpResponse.json({ organismos })),

  http.get(`${apiUrl}/admin/usuarios`, () => HttpResponse.json({ usuarios })),

  http.post(`${apiUrl}/admin/usuarios`, async ({ request }) => {
    const cuerpo = (await request.json()) as DatosAltaUsuario;

    if (usuarios.some((usuario) => usuario.email === cuerpo.email)) {
      return HttpResponse.json(
        { error: { codigo: 'EMAIL_EN_USO', mensaje: 'Ya hay una cuenta con ese correo' } },
        { status: 409 },
      );
    }

    // El caso de un operador sin área no llega desde la web (lo valida el
    // formulario), pero acá se repite el control del servidor.
    if (cuerpo.rol === 'OPERADOR' && !cuerpo.areaId) {
      return HttpResponse.json(
        {
          error: {
            codigo: 'DATOS_INVALIDOS',
            mensaje: 'Hay datos inválidos',
            detalles: [{ campo: 'areaId', mensaje: 'Es obligatoria' }],
          },
        },
        { status: 400 },
      );
    }

    const creado: Usuario = {
      id: proximoId++,
      email: cuerpo.email,
      nombre: cuerpo.nombre,
      rol: cuerpo.rol,
      organismoId: cuerpo.organismoId,
      areaId: cuerpo.areaId,
    };
    usuarios = [...usuarios, creado];
    return HttpResponse.json({ usuario: creado }, { status: 201 });
  }),

  http.post(`${apiUrl}/reportes`, async ({ request }) => {
    const formulario = await request.formData();
    const categoriaId = Number(formulario.get('categoriaId'));
    const id = proximoIncidenteId++;

    // El reporte nuevo se guarda y lo devuelve GET /incidentes: así aparece en el mapa.
    incidentes = [
      ...incidentes,
      {
        id,
        lat: Number(formulario.get('lat')),
        lon: Number(formulario.get('lon')),
        categoriaId,
        categoriaNombre: nombreCategoria(categoriaId),
        estado: 'REGISTRADO',
        enRevision: true,
        primerReporteEn: new Date().toISOString(),
        cantidadReportes: 1,
      },
    ];

    // El reporte recién creado también entra en «Mis reportes» (del más nuevo al más viejo).
    reportesMios = [
      {
        id: proximoReporteId++,
        registradoEn: new Date().toISOString(),
        categoria: { id: categoriaId, nombre: nombreCategoria(categoriaId) },
        severidadDeclarada:
          (formulario.get('severidadDeclarada') as ReporteMio['severidadDeclarada']) ?? 'LEVE',
        descripcion: (formulario.get('descripcion') as string | null) || null,
        fotos: [],
        estadoVerificacion: 'PENDIENTE_REVISION',
        incidente: { id, estado: 'REGISTRADO', enRevision: true },
      },
      ...reportesMios,
    ];

    return HttpResponse.json(
      { id, incidenteId: id, nivelConfianza: 0, estadoVerificacion: 'PENDIENTE_REVISION' },
      { status: 201 },
    );
  }),

  http.get(`${apiUrl}/reportes/pendientes`, () => HttpResponse.json({ reportes: reportesPendientes })),

  http.post(`${apiUrl}/reportes/:id/revision`, async ({ params, request }) => {
    const cuerpo = (await request.json()) as { decision?: string };
    const id = Number(params.id);
    const reporte = reportesPendientes.find((item) => item.id === id);
    if (!reporte) {
      return HttpResponse.json(
        { error: { codigo: 'REPORTE_NO_ENCONTRADO', mensaje: 'El reporte no existe' } },
        { status: 404 },
      );
    }
    if (cuerpo.decision !== 'VERIFICADO' && cuerpo.decision !== 'DESESTIMADO') {
      return HttpResponse.json(
        {
          error: {
            codigo: 'DATOS_INVALIDOS',
            mensaje: 'Hay datos inválidos',
            detalles: [{ campo: 'decision', mensaje: 'Debe ser VERIFICADO o DESESTIMADO' }],
          },
        },
        { status: 400 },
      );
    }
    // Al decidir, el reporte sale de la lista: así la pantalla lo muestra al refrescar.
    reportesPendientes = reportesPendientes.filter((item) => item.id !== id);
    const estadoIncidente = cuerpo.decision === 'VERIFICADO' ? 'VERIFICADO' : 'DESESTIMADO';
    return HttpResponse.json({
      id,
      estadoVerificacion: cuerpo.decision,
      incidente: reporte.incidente ? { id: reporte.incidente.id, estado: estadoIncidente } : null,
      vecino: { reputacion: cuerpo.decision === 'VERIFICADO' ? 66.67 : 33.33 },
    } satisfies ResultadoRevision);
  }),
];
