import { http, HttpResponse } from 'msw';
import { apiUrl } from '../../../config/entorno.js';

const usuarioVecino = {
  id: 2,
  email: 'vecino@ejemplo.com',
  nombre: 'Vecino',
  rol: 'VECINO',
  organismoId: null,
  areaId: null,
};

export const handlers = [
  http.get(`${apiUrl}/salud`, () => HttpResponse.json({ estado: 'ok', baseDeDatos: 'ok' })),
  http.post(`${apiUrl}/auth/renovar`, () =>
    HttpResponse.json({
      tokenAcceso: 'acceso-simulado',
      tokenRenovacion: 'renovacion-simulada',
      usuario: usuarioVecino,
    }),
  ),
  http.post(`${apiUrl}/auth/ingreso`, ({ request }) => {
    // Con "rechazado@ejemplo.com" se prueba el camino de error en desarrollo.
    if (request.body) {
      const cuerpo = JSON.parse(String(request.body)) as { email?: string };
      if (cuerpo.email === 'rechazado@ejemplo.com') {
        return HttpResponse.json(
          { error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'El correo o la clave no son válidos.' } },
          { status: 401 },
        );
      }
    }
    return HttpResponse.json({
      tokenAcceso: 'acceso-simulado',
      tokenRenovacion: 'renovacion-simulada',
      usuario: usuarioVecino,
    });
  }),
  http.post(`${apiUrl}/auth/registro`, () => HttpResponse.json({ usuario: usuarioVecino }, { status: 201 })),
  http.get(`${apiUrl}/auth/yo`, () => HttpResponse.json({ usuario: usuarioVecino })),
  http.post(`${apiUrl}/auth/salir`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${apiUrl}/auth/confirmar-correo`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${apiUrl}/auth/recuperar-clave`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${apiUrl}/auth/restablecer-clave`, () => new HttpResponse(null, { status: 204 })),
];
