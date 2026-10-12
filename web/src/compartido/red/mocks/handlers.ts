import { http, HttpResponse } from 'msw';
import type { Usuario } from '../../sesion/usuario.js';
import type { DatosAltaUsuario, Organismo } from '../../../funcionalidades/administracion/tipos.js';
import type { FichaIncidente, PuntoMapa } from '../../../funcionalidades/mapa/tipos.js';
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

// Categorías activas que devuelve GET /categorias (id y nombre alcanzan para el formulario).
const categorias = [
  { id: 1, nombre: 'Bache en la calzada' },
  { id: 2, nombre: 'Luminaria apagada' },
  { id: 3, nombre: 'Cordón sin rampa' },
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
];
let proximoIncidenteId = 2;

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
        { error: { codigo: 'NO_ENCONTRADO', mensaje: 'El incidente no existe' } },
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

    return HttpResponse.json(
      { id, incidenteId: id, nivelConfianza: 0, estadoVerificacion: 'PENDIENTE_REVISION' },
      { status: 201 },
    );
  }),
];
