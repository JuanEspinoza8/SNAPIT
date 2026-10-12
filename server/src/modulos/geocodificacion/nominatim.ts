import { z } from 'zod';
import { env } from '../../config/env.js';
import type { DireccionNominatim } from './calculo.js';

// Política de uso del servicio público (https://operations.osmfoundation.org/policies/nominatim/):
// como mucho una consulta por segundo, un User-Agent que identifique a la aplicación y guardar las respuestas.

const esquemaRespuesta = z.object({
  address: z.record(z.string(), z.unknown()).optional(),
  error: z.unknown().optional(),
});

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
  const cache = new Map<string, DireccionNominatim | null>();
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

  async function consultar(lat: number, lon: number) {
    const direccion = new URL(`${url}/reverse`);
    direccion.search = new URLSearchParams({
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lon),
      // 18 es el nivel de edificio: así llega la altura cuando está cargada.
      zoom: '18',
      addressdetails: '1',
      'accept-language': 'es',
    }).toString();

    const respuesta = await fetch(direccion, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!respuesta.ok) throw new Error(`Nominatim respondió ${respuesta.status}`);
    const datos = esquemaRespuesta.safeParse(await respuesta.json());
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
    const clave = `${latRedondeada},${lonRedondeada}`;
    if (cache.has(clave)) return cache.get(clave)!;

    // Las fallas no se guardan: la próxima vez se vuelve a preguntar.
    const resultado = await enTurno(() => consultar(latRedondeada, lonRedondeada));
    if (cache.size >= tamanoCache) cache.delete(cache.keys().next().value!);
    cache.set(clave, resultado);
    return resultado;
  }

  return { direccionDe };
}

export const nominatim = crearClienteNominatim({
  url: env.NOMINATIM_URL,
  userAgent: env.NOMINATIM_USER_AGENT,
});
