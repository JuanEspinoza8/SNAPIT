import { http, HttpResponse } from 'msw';
import { apiUrl } from '../../../config/entorno.js';

export const handlers = [
  http.get(`${apiUrl}/salud`, () => HttpResponse.json({ estado: 'ok', baseDeDatos: 'ok' })),
  http.post(`${apiUrl}/auth/renovar`, () =>
    HttpResponse.json({
      tokenAcceso: 'acceso-simulado',
      tokenRenovacion: 'renovacion-simulada',
      usuario: {
        id: 1,
        email: 'vecino@ejemplo.com',
        nombre: 'Vecino',
        rol: 'VECINO',
        organismoId: null,
        areaId: null,
      },
    }),
  ),
];
