import { z } from 'zod';

// Overpass se usa solo en los scripts de importación, y la respuesta se guarda en db/datos/: el servicio
// público es compartido y se satura seguido (responde 429, 502 o 504).

const esquemaElemento = z.object({
  type: z.enum(['node', 'way', 'relation']),
  id: z.number().int().positive(),
  // Los nodos traen lat y lon; las áreas (way y relation), el centro, si se pide con "out center".
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

const esquemaRespuesta = z.object({
  osm3s: z.object({ timestamp_osm_base: z.string().optional() }).optional(),
  remark: z.string().optional(),
  elements: z.array(esquemaElemento),
});

export type ElementoOsm = z.infer<typeof esquemaElemento>;

export interface RespuestaOverpass {
  elementos: ElementoOsm[];
  /** Hasta cuándo están actualizados los datos de OSM que usó Overpass. */
  fechaDatos: string | null;
}

/** Interpreta el texto de una respuesta de Overpass. Lanza un error si no es lo esperado o está incompleta. */
export function leerRespuestaOverpass(texto: string): RespuestaOverpass {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error('La respuesta de Overpass no es JSON');
  }
  const datos = esquemaRespuesta.safeParse(json);
  if (!datos.success) throw new Error('La respuesta de Overpass no tiene la forma esperada');
  // Si se le acaba el tiempo o la memoria, Overpass responde 200 con lo que llegó a juntar y lo avisa acá.
  if (datos.data.remark && /error/i.test(datos.data.remark)) {
    throw new Error(`Overpass no terminó la consulta: ${datos.data.remark}`);
  }
  return { elementos: datos.data.elements, fechaDatos: datos.data.osm3s?.timestamp_osm_base ?? null };
}

export interface OpcionesOverpass {
  url: string;
  userAgent: string;
  timeoutMs?: number;
}

export function crearClienteOverpass({ url, userAgent, timeoutMs = 180_000 }: OpcionesOverpass) {
  /** Corre la consulta. Devuelve el texto tal cual llegó, para guardarlo, y ya interpretado. */
  async function consultar(consulta: string): Promise<RespuestaOverpass & { texto: string }> {
    let texto: string;
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        body: new URLSearchParams({ data: consulta }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!respuesta.ok) throw new Error(`Overpass respondió ${respuesta.status}`);
      texto = await respuesta.text();
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(`Overpass no respondió en ${timeoutMs / 1000} s`, { cause: error });
      }
      if (error instanceof TypeError) {
        throw new Error(`No se pudo conectar con Overpass (${url})`, { cause: error });
      }
      throw error;
    }
    return { texto, ...leerRespuestaOverpass(texto) };
  }

  return { consultar };
}

export type ClienteOverpass = ReturnType<typeof crearClienteOverpass>;
