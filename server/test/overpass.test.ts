import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearClienteOverpass } from '../src/modulos/red/overpass.js';

// Overpass simulado: ningún test sale a la red.
const fetchSimulado = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const cliente = crearClienteOverpass({
  url: 'https://overpass.test/api/interpreter',
  userAgent: 'SnapIt/prueba',
});

const RESPUESTA = JSON.stringify({
  osm3s: { timestamp_osm_base: '2026-10-17T03:04:06Z' },
  elements: [{ type: 'node', id: 1, lat: -38.95, lon: -68.06, tags: { amenity: 'school' } }],
});

describe('cliente de Overpass', () => {
  it('manda la consulta por POST con el User-Agent propio y devuelve el texto tal cual llegó', async () => {
    fetchSimulado.mockResolvedValueOnce(new Response(RESPUESTA));

    const respuesta = await cliente.consultar('[out:json];node(1);out;');

    expect(respuesta.texto).toBe(RESPUESTA);
    expect(respuesta.elementos).toHaveLength(1);
    expect(respuesta.fechaDatos).toBe('2026-10-17T03:04:06Z');
    const [url, opciones] = fetchSimulado.mock.calls[0]!;
    expect(String(url)).toBe('https://overpass.test/api/interpreter');
    expect(opciones?.method).toBe('POST');
    expect(opciones?.headers).toMatchObject({ 'User-Agent': 'SnapIt/prueba' });
    expect(String(opciones?.body)).toBe(new URLSearchParams({ data: '[out:json];node(1);out;' }).toString());
  });

  it('un error HTTP (servicio saturado) es una falla con el código', async () => {
    fetchSimulado.mockResolvedValueOnce(new Response('<html>Too Many Requests</html>', { status: 429 }));
    await expect(cliente.consultar('x')).rejects.toThrow('Overpass respondió 429');
  });

  it('una respuesta cortada por tiempo es una falla, aunque llegue con 200', async () => {
    const cortada = JSON.stringify({ remark: 'runtime error: Query timed out', elements: [] });
    fetchSimulado.mockResolvedValueOnce(new Response(cortada));
    await expect(cliente.consultar('x')).rejects.toThrow('Overpass no terminó la consulta');
  });

  it('sin red avisa que no se pudo conectar', async () => {
    fetchSimulado.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(cliente.consultar('x')).rejects.toThrow(
      'No se pudo conectar con Overpass (https://overpass.test/api/interpreter)',
    );
  });

  it('si no responde a tiempo, lo dice con el límite en segundos', async () => {
    fetchSimulado.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));
    await expect(cliente.consultar('x')).rejects.toThrow('Overpass no respondió en 180 s');
  });
});
