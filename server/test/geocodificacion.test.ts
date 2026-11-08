import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { nominatim } from '../src/modulos/geocodificacion/nominatim.js';
import { tokenDe } from './apoyo.js';

// Nominatim simulado: ningún test sale a la red.
vi.mock('../src/modulos/geocodificacion/nominatim.js', () => ({ nominatim: { buscar: vi.fn() } }));
const buscar = vi.mocked(nominatim.buscar);

let token: string;

beforeAll(async () => {
  token = await tokenDe('VECINO');
});

beforeEach(() => {
  buscar.mockReset();
});

const pedir = (texto?: string) =>
  request(app)
    .get('/api/geocodificacion')
    .set('Authorization', `Bearer ${token}`)
    .query(texto === undefined ? {} : { texto });

describe('GET /api/geocodificacion', () => {
  it('devuelve los lugares de Neuquén Capital y deja afuera los de otras ciudades', async () => {
    buscar.mockResolvedValueOnce([
      // Cipolletti: dentro del rectángulo de la ciudad, pero del otro lado del río.
      {
        lat: -38.9299352,
        lon: -68.008819,
        name: '',
        address: {
          road: 'Saavedra',
          house_number: '500',
          city: 'Municipio de Cipolletti',
          state: 'Río Negro',
        },
      },
      {
        lat: -38.9601407,
        lon: -68.0897074,
        name: '',
        address: { road: 'Cornelio Saavedra', house_number: '500', suburb: 'La Sirena', city: 'Neuquén' },
      },
    ]);

    const res = await pedir('Saavedra 500');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      lugares: [{ nombre: 'Cornelio Saavedra 500, La Sirena', lat: -38.9601407, lon: -68.0897074 }],
    });
    expect(buscar).toHaveBeenCalledWith('Saavedra 500', expect.objectContaining({ oeste: -68.2019 }));
  });

  it('sin resultados devuelve la lista vacía', async () => {
    buscar.mockResolvedValueOnce([]);

    const res = await pedir('xyzzy');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lugares: [] });
  });

  it('con Nominatim caído responde 503 con un mensaje claro', async () => {
    buscar.mockRejectedValueOnce(new Error('Nominatim respondió 503'));

    const res = await pedir('Saavedra 500');

    expect(res.status).toBe(503);
    expect(res.body.error).toEqual({
      codigo: 'GEOCODIFICACION_NO_DISPONIBLE',
      mensaje:
        'No se pudo buscar la dirección porque el servicio de mapas no responde. Probá de nuevo en un rato o marcá el punto en el mapa',
    });
  });

  it('pide un texto de al menos 3 letras', async () => {
    const corto = await pedir('  ab ');
    const sinTexto = await pedir();

    expect(corto.status).toBe(400);
    expect(corto.body.error.detalles).toEqual([{ campo: 'texto', mensaje: 'Escribí al menos 3 letras' }]);
    expect(sinTexto.body.error.detalles).toEqual([{ campo: 'texto', mensaje: 'Es obligatorio' }]);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('sin sesión responde 401', async () => {
    const res = await request(app).get('/api/geocodificacion').query({ texto: 'Saavedra 500' });

    expect(res.status).toBe(401);
  });
});
