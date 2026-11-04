import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEUQUEN_CAPITAL } from '../src/modulos/geocodificacion/calculo.js';
import { crearClienteNominatim, type OpcionesNominatim } from '../src/modulos/geocodificacion/nominatim.js';

// Nominatim simulado: ningún test sale a la red.
const fetchSimulado = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const responder = (cuerpo: unknown, status = 200) =>
  new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const DIRECCION = {
  road: 'Avenida Argentina',
  house_number: '250',
  suburb: 'Área Centro Este',
  city: 'Neuquén',
};

// Sin espera entre consultas, salvo en el test que la mide.
const cliente = (opciones: Partial<OpcionesNominatim> = {}) =>
  crearClienteNominatim({
    url: 'https://nominatim.test',
    userAgent: 'SnapIt/prueba',
    intervaloMs: 0,
    ...opciones,
  });

describe('cliente de Nominatim', () => {
  it('pide /reverse con el punto redondeado, en castellano y con el User-Agent propio', async () => {
    fetchSimulado.mockResolvedValueOnce(responder({ address: DIRECCION }));

    const direccion = await cliente().direccionDe(-38.951612345, -68.059187654);

    expect(direccion).toEqual(DIRECCION);
    const [url, opciones] = fetchSimulado.mock.calls[0]!;
    const pedido = new URL(String(url));
    expect(pedido.origin + pedido.pathname).toBe('https://nominatim.test/reverse');
    expect(Object.fromEntries(pedido.searchParams)).toEqual({
      format: 'jsonv2',
      lat: '-38.9516',
      lon: '-68.0592',
      zoom: '18',
      addressdetails: '1',
      'accept-language': 'es',
    });
    expect(opciones?.headers).toMatchObject({ 'User-Agent': 'SnapIt/prueba' });
  });

  it('si no tiene nada cargado cerca ("Unable to geocode") devuelve null, sin fallar', async () => {
    fetchSimulado.mockResolvedValueOnce(responder({ error: 'Unable to geocode' }));

    await expect(cliente().direccionDe(-38.95, -68.05)).resolves.toBeNull();
  });

  it('un error HTTP es una falla', async () => {
    fetchSimulado.mockResolvedValueOnce(responder({ error: 'Too many requests' }, 429));

    await expect(cliente().direccionDe(-38.95, -68.05)).rejects.toThrow('Nominatim respondió 429');
  });

  it('una respuesta que no es una dirección es una falla', async () => {
    fetchSimulado.mockResolvedValueOnce(responder({ otra: 'cosa' }));
    fetchSimulado.mockResolvedValueOnce(responder('<html>no es JSON</html>'));
    const nominatim = cliente();

    await expect(nominatim.direccionDe(-38.95, -68.05)).rejects.toThrow('no es una dirección');
    await expect(nominatim.direccionDe(-38.96, -68.05)).rejects.toThrow();
  });

  it('si no responde a tiempo es una falla', async () => {
    // Un servidor que nunca contesta: solo termina cuando se vence el plazo.
    fetchSimulado.mockImplementationOnce(
      (_url, opciones) =>
        new Promise((_resolver, rechazar) => {
          opciones?.signal?.addEventListener('abort', () => rechazar(opciones.signal!.reason));
        }),
    );

    await expect(cliente({ timeoutMs: 50 }).direccionDe(-38.95, -68.05)).rejects.toHaveProperty(
      'name',
      'TimeoutError',
    );
  });

  it('un punto a pocos metros de otro ya consultado sale de la caché', async () => {
    fetchSimulado.mockResolvedValueOnce(responder({ address: DIRECCION }));
    const nominatim = cliente();

    const primera = await nominatim.direccionDe(-38.95161, -68.05919);
    const segunda = await nominatim.direccionDe(-38.95159, -68.05921);

    expect(segunda).toEqual(primera);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it('las fallas no se guardan: la próxima vez se vuelve a preguntar', async () => {
    fetchSimulado.mockResolvedValueOnce(responder({}, 503));
    fetchSimulado.mockResolvedValueOnce(responder({ address: DIRECCION }));
    const nominatim = cliente();

    await expect(nominatim.direccionDe(-38.95, -68.05)).rejects.toThrow();
    await expect(nominatim.direccionDe(-38.95, -68.05)).resolves.toEqual(DIRECCION);
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });

  it('una falla no traba las consultas que esperan su turno', async () => {
    fetchSimulado.mockResolvedValueOnce(responder({}, 500));
    fetchSimulado.mockResolvedValueOnce(responder({ address: DIRECCION }));
    const nominatim = cliente();

    const [primera, segunda] = await Promise.allSettled([
      nominatim.direccionDe(-38.95, -68.05),
      nominatim.direccionDe(-38.96, -68.06),
    ]);

    expect(primera.status).toBe('rejected');
    expect(segunda).toEqual({ status: 'fulfilled', value: DIRECCION });
  });

  it('entre una consulta y la siguiente pasa al menos un segundo', async () => {
    vi.useFakeTimers();
    fetchSimulado.mockImplementation(async () => responder({ address: DIRECCION }));
    const nominatim = cliente({ intervaloMs: 1000 });

    const consultas = Promise.all([
      nominatim.direccionDe(-38.95, -68.05),
      nominatim.direccionDe(-38.96, -68.06),
    ]);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
    await consultas;
  });

  it('la caché tiene un tope: al llenarse se olvida de la consulta más vieja', async () => {
    fetchSimulado.mockImplementation(async () => responder({ address: DIRECCION }));
    const nominatim = cliente({ tamanoCache: 2 });

    await nominatim.direccionDe(-38.1, -68.1);
    await nominatim.direccionDe(-38.2, -68.2);
    await nominatim.direccionDe(-38.3, -68.3);
    expect(fetchSimulado).toHaveBeenCalledTimes(3);

    await nominatim.direccionDe(-38.3, -68.3);
    expect(fetchSimulado).toHaveBeenCalledTimes(3);
    await nominatim.direccionDe(-38.1, -68.1);
    expect(fetchSimulado).toHaveBeenCalledTimes(4);
  });
});

describe('buscar en Nominatim', () => {
  const LUGAR = { lat: '-38.9601407', lon: '-68.0897074', name: '', address: DIRECCION };

  it('pide /search acotado a la caja, en Argentina, en castellano y con el User-Agent propio', async () => {
    fetchSimulado.mockResolvedValueOnce(responder([LUGAR]));

    const resultados = await cliente().buscar('  Saavedra   500 ', NEUQUEN_CAPITAL);

    expect(resultados).toEqual([{ lat: -38.9601407, lon: -68.0897074, name: '', address: DIRECCION }]);
    const [url, opciones] = fetchSimulado.mock.calls[0]!;
    const pedido = new URL(String(url));
    expect(pedido.origin + pedido.pathname).toBe('https://nominatim.test/search');
    expect(Object.fromEntries(pedido.searchParams)).toEqual({
      q: 'Saavedra 500',
      format: 'jsonv2',
      addressdetails: '1',
      countrycodes: 'ar',
      // Oeste, norte, este y sur.
      viewbox: '-68.2019,-38.8815,-67.9987,-38.9956',
      bounded: '1',
      limit: '10',
      'accept-language': 'es',
    });
    expect(opciones?.headers).toMatchObject({ 'User-Agent': 'SnapIt/prueba' });
  });

  it('el mismo texto, con otras mayúsculas o espacios, sale de la caché', async () => {
    fetchSimulado.mockResolvedValueOnce(responder([LUGAR]));
    const nominatim = cliente();

    await nominatim.buscar('Saavedra 500', NEUQUEN_CAPITAL);
    await nominatim.buscar('saavedra  500', NEUQUEN_CAPITAL);

    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it('sin resultados devuelve una lista vacía, sin fallar', async () => {
    fetchSimulado.mockResolvedValueOnce(responder([]));

    await expect(cliente().buscar('xyzzy', NEUQUEN_CAPITAL)).resolves.toEqual([]);
  });

  it('un error HTTP o una respuesta que no es una lista es una falla, y no se guarda', async () => {
    fetchSimulado.mockResolvedValueOnce(responder({}, 503));
    fetchSimulado.mockResolvedValueOnce(responder({ error: 'algo' }));
    fetchSimulado.mockResolvedValueOnce(responder([LUGAR]));
    const nominatim = cliente();

    await expect(nominatim.buscar('Saavedra 500', NEUQUEN_CAPITAL)).rejects.toThrow(
      'Nominatim respondió 503',
    );
    await expect(nominatim.buscar('Saavedra 500', NEUQUEN_CAPITAL)).rejects.toThrow(
      'no es una lista de lugares',
    );
    await expect(nominatim.buscar('Saavedra 500', NEUQUEN_CAPITAL)).resolves.toHaveLength(1);
  });

  it('comparte con la dirección de los reportes el límite de una consulta por segundo', async () => {
    vi.useFakeTimers();
    fetchSimulado.mockImplementation(async (url) =>
      String(url).includes('/search') ? responder([LUGAR]) : responder({ address: DIRECCION }),
    );
    const nominatim = cliente({ intervaloMs: 1000 });

    const consultas = Promise.all([
      nominatim.direccionDe(-38.95, -68.05),
      nominatim.buscar('Saavedra 500', NEUQUEN_CAPITAL),
    ]);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
    await consultas;
  });
});
