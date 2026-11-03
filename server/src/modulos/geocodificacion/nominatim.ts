import { z } from 'zod';
import { env } from '../../config/env.js';
import type { Caja, DireccionNominatim, ResultadoBusqueda } from './calculo.js';

// Política de uso del servicio público (https://operations.osmfoundation.org/policies/nominatim/):
// como mucho una consulta por segundo, un User-Agent que identifique a la aplicación y guardar las respuestas.

const esquemaRespuesta = z.object({
  address: z.record(z.string(), z.unknown()).optional(),
  error: z.unknown().optional(),
});

const esquemaBusqueda = z.array(
  z.object({
    lat: z.coerce.number(),
    lon: z.coerce.number(),
    name: z.string().optional(),
    address: z.record(z.string(), z.unknown()).optional(),
  }),
);

export interface OpcionesNominatim {
  url: string;
  userAgent: string;
  /** Tiempo mínimo entre el comienzo de una consulta y el de la siguiente. */
  intervaloMs?: number;
  timeoutMs?: number;
  tamanoCache?: number;
}

export function crearClienteNominatim({
  url,
  userAgent,
  intervaloMs = 1000,
  timeoutMs = 10_000,
  tamanoCache = 1000,
}: OpcionesNominatim) {
  // Una sola caché para las dos consultas: la clave dice de cuál es.
  const cache = new Map<string, unknown>();
  // Las consultas van de a una, en el orden en que se pidieron.
  let cola: Promise<unknown> = Promise.resolve();
  let ultimaConsulta = -Infinity;

  function enTurno<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = cola.then(async () => {
      const espera = ultimaConsulta + intervaloMs - Date.now();
      if (espera > 0) await new Promise((listo) => setTimeout(listo, espera));
      ultimaConsulta = Date.now();
      return tarea();
    });
    // Una consulta que falla no tiene que trabar a las que vienen atrás.
    cola = resultado.catch(() => {});
    return resultado;
  }

  /** Lo guardado para esa clave o, si no está, el resultado de la consulta. Las fallas no se guardan. */
  async function conCache<T>(clave: string, consulta: () => Promise<T>): Promise<T> {
    if (cache.has(clave)) return cache.get(clave) as T;
    const resultado = await enTurno(consulta);
    if (cache.size >= tamanoCache) cache.delete(cache.keys().next().value!);
    cache.set(clave, resultado);
    return resultado;
  }

  async function pedir(ruta: string, parametros: Record<string, string>) {
    const direccion = new URL(`${url}/${ruta}`);
    direccion.search = new URLSearchParams(parametros).toString();
    const respuesta = await fetch(direccion, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!respuesta.ok) throw new Error(`Nominatim respondió ${respuesta.status}`);
    return respuesta.json() as Promise<unknown>;
  }

  async function consultar(lat: number, lon: number) {
    const respuesta = await pedir('reverse', {
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lon),
      // 18 es el nivel de edificio: así llega la altura cuando está cargada.
      zoom: '18',
      addressdetails: '1',
      'accept-language': 'es',
    });
    const datos = esquemaRespuesta.safeParse(respuesta);
    if (datos.success && datos.data.address) return datos.data.address;
    // { error: "Unable to geocode" }: no hay nada cargado cerca. No es una falla: reintentar daría lo mismo.
    if (datos.success && datos.data.error !== undefined) return null;
    throw new Error('Nominatim respondió algo que no es una dirección');
  }

  /**
   * La dirección del punto según Nominatim, o null si no tiene nada cargado cerca.
   * Lanza un error si el servicio falla, no responde a tiempo o responde algo inesperado.
   */
  async function direccionDe(lat: number, lon: number): Promise<DireccionNominatim | null> {
    // Redondeado a 4 decimales (unos 10 m): reportes del mismo problema comparten la consulta. Se le
    // pregunta por el punto redondeado, así lo guardado es justo lo que corresponde a esa clave.
    const latRedondeada = Number(lat.toFixed(4));
    const lonRedondeada = Number(lon.toFixed(4));
    return conCache(`inversa:${latRedondeada},${lonRedondeada}`, () =>
      consultar(latRedondeada, lonRedondeada),
    );
  }

  /**
   * Los lugares que Nominatim encuentra para el texto dentro de la caja (con su dirección, para que quien llama
   * decida cuáles le sirven). Lanza un error si el servicio falla, no responde a tiempo o responde algo inesperado.
   */
  async function buscar(texto: string, caja: Caja): Promise<ResultadoBusqueda[]> {
    // "Saavedra 500" y "saavedra  500" son la misma búsqueda.
    const normalizado = texto.trim().replace(/\s+/g, ' ');
    const viewbox = [caja.oeste, caja.norte, caja.este, caja.sur].join(',');
    return conCache(`busqueda:${viewbox}:${normalizado.toLowerCase()}`, async () => {
      const respuesta = await pedir('search', {
        q: normalizado,
        format: 'jsonv2',
        addressdetails: '1',
        countrycodes: 'ar',
        // bounded=1 deja solo lo que cae adentro de la caja; sin eso, la caja apenas ordena los resultados.
        viewbox,
        bounded: '1',
        limit: '10',
        'accept-language': 'es',
      });
      const datos = esquemaBusqueda.safeParse(respuesta);
      if (!datos.success) throw new Error('Nominatim respondió algo que no es una lista de lugares');
      return datos.data;
    });
  }

  return { direccionDe, buscar };
}

export const nominatim = crearClienteNominatim({
  url: env.NOMINATIM_URL,
  userAgent: env.NOMINATIM_USER_AGENT,
});
