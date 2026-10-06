import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/salud', () => HttpResponse.json({ estado: 'ok', baseDeDatos: 'ok' })),
  http.post('/api/auth/renovar', () =>
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
