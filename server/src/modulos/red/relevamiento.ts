import { z } from 'zod';
import type { NodoRed, TramoRed } from './redPeatonal.js';

// Las opciones de la planilla del relevamiento (#101), tal como se anotaron.
const RAMPA = ['sí', 'sí, pero mal', 'no', 'no corresponde', 'no se ve'] as const;
const SEMAFORO = ['no hay', 'sí, sin pulsador', 'sí, con pulsador o parlante', 'no se ve'] as const;
const SI_NO = ['sí', 'no', 'no se ve'] as const;
const VEREDA = ['buena', 'regular', 'mala', 'no hay vereda', 'cantero / no aplica', 'no se ve'] as const;
const ESCALONES = ['no', 'en N u O', 'en S o E', 'en las dos', 'no se ve'] as const;
const SUPERFICIE = [
  'hormigón',
  'baldosa',
  'adoquín',
  'tierra',
  'ripio',
  'pasto',
  'mixta',
  'no se ve',
] as const;
const SILLA = ['sí', 'solo por un lado', 'no', 'no se ve'] as const;

// tramo_peatonal.ancho_estimado es numeric(4,2).
const ANCHO_MAX = 99.99;

const fechaImagen = z.string().regex(/^\d{4}-\d{2}$/, 'tiene que ser año-mes, por ejemplo 2025-08');
const vereda = z.enum(VEREDA).nullable();

const esquinaEsquema = z.object({
  id: z.string().min(1),
  nombre: z.string(),
  lat: z.number(),
  lon: z.number(),
  nodosOsm: z.array(z.number().int()).min(1),
  fechaImagen,
  rampas: z.object({
    NO: z.enum(RAMPA).nullable(),
    NE: z.enum(RAMPA).nullable(),
    SO: z.enum(RAMPA).nullable(),
    SE: z.enum(RAMPA).nullable(),
  }),
  semaforo: z.enum(SEMAFORO).nullable(),
  pisoPodotactil: z.enum(SI_NO).nullable(),
  observaciones: z.string().nullable(),
});

const cuadraEsquema = z.object({
  id: z.string().min(1),
  calle: z.string().min(1),
  entre: z.string(),
  esquinas: z.tuple([z.string(), z.string()]),
  fechaImagen,
  // Una calle que va de oeste a este tiene veredas N y S; una que va de sur a norte, O y E.
  veredas: z.union([z.strictObject({ N: vereda, S: vereda }), z.strictObject({ O: vereda, E: vereda })]),
  escalones: z.enum(ESCALONES).nullable(),
  superficie: z.enum(SUPERFICIE).nullable(),
  anchoMetros: z.number().positive().max(ANCHO_MAX).nullable(),
  pendienteFuerte: z.enum(SI_NO).nullable(),
  pasaSillaDeRuedas: z.enum(SILLA).nullable(),
  queLaBloquea: z.string().nullable(),
  observaciones: z.string().nullable(),
});

const puntoEsquema = z.object({
  id: z.string().min(1),
  donde: z.string(),
  pregunta: z.string(),
  fechaImagen: fechaImagen.nullable(),
  sePasaCaminando: z.enum(SI_NO).nullable(),
  sePasaEnSilla: z.enum(SI_NO).nullable(),
  detalle: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  /** Caminos de OSM que no son públicos y salen de la red, como "way/123". */
  quitarCaminos: z.array(z.string().regex(/^way\/\d+$/, 'tiene que ser como way/123')).optional(),
  /** Dos nodos de OSM que en la realidad se unen caminando aunque en OSM no. */
  conectarNodos: z
    .tuple([z.number().int(), z.number().int()])
    .refine(([a, b]) => a !== b, 'los dos nodos tienen que ser distintos')
    .optional(),
});

const esquema = z
  .object({
    zona: z.string(),
    metodo: z.string(),
    esquinas: z.array(esquinaEsquema),
    cuadras: z.array(cuadraEsquema),
    puntos: z.array(puntoEsquema),
  })
  .superRefine((relevamiento, ctx) => {
    const ids = new Set(relevamiento.esquinas.map((esquina) => esquina.id));
    relevamiento.cuadras.forEach((cuadra, i) => {
      for (const id of cuadra.esquinas) {
        if (!ids.has(id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['cuadras', i, 'esquinas'],
            message: `no existe la esquina ${id}`,
          });
        }
      }
    });
  });

export type Relevamiento = z.infer<typeof esquema>;
type Esquina = Relevamiento['esquinas'][number];
type Cuadra = Relevamiento['cuadras'][number];
type Punta = keyof Esquina['rampas'];
type Lado = 'N' | 'S' | 'O' | 'E';

/**
 * Lee el relevamiento de la zona piloto (`db/datos/relevamiento-zona-piloto.json`). Lanza un error que dice
 * qué está mal: un valor que no es de la planilla o una cuadra que nombra una esquina que no existe.
 */
export function leerRelevamiento(texto: string): Relevamiento {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error('El archivo del relevamiento no es JSON');
  }
  const datos = esquema.safeParse(json);
  if (!datos.success) {
    const problemas = datos.error.issues.map(
      (p) => (p.path.length ? `${p.path.join('.')}: ` : '') + p.message,
    );
    throw new Error(`El relevamiento no tiene la forma esperada (${problemas.join('; ')})`);
  }
  return datos.data;
}

// Cuentan como rampa las puntas por donde no hace falta cruzar. Una rampa rota o tapada no sirve.
const CON_RAMPA: (string | null)[] = ['sí', 'no corresponde'];
const SIN_RAMPA: (string | null)[] = ['no', 'sí, pero mal'];
const SIN_VEREDA: (string | null)[] = ['no hay vereda', 'cantero / no aplica'];

/**
 * Qué punta de cada esquina toca cada vereda. La primera es la de la esquina del oeste (veredas N y S) o la del
 * sur (veredas O y E); la segunda, la de la otra esquina. Por ejemplo, la vereda N empieza en la punta NE de la
 * esquina del oeste y termina en la punta NO de la del este.
 */
const PUNTAS: Record<Lado, [Punta, Punta]> = {
  N: ['NE', 'NO'],
  S: ['SE', 'SO'],
  O: ['NO', 'SO'],
  E: ['NE', 'SE'],
};

/**
 * Si se puede subir y bajar de una vereda sin escalón: tiene rampa en las dos puntas. null si no se sabe
 * (alguna punta no se vio).
 */
function rampaDeVereda(estado: string | null, inicio: string | null, fin: string | null) {
  if (SIN_VEREDA.includes(estado)) return false;
  if (SIN_RAMPA.includes(inicio) || SIN_RAMPA.includes(fin)) return false;
  if (CON_RAMPA.includes(inicio) && CON_RAMPA.includes(fin)) return true;
  return null;
}

/**
 * `tiene_rampa` de una cuadra: alcanza con que una de sus dos veredas tenga rampa en las dos puntas.
 * null si no se puede decidir: queda el valor de OSM.
 */
export function rampaDeCuadra(cuadra: Cuadra, [a, b]: [Esquina, Esquina]) {
  const lados = Object.keys(cuadra.veredas) as Lado[];
  const deOesteAEste = lados.includes('N');
  const [inicio, fin] = (deOesteAEste ? a.lon <= b.lon : a.lat <= b.lat) ? [a, b] : [b, a];
  const veredas = cuadra.veredas as Partial<Record<Lado, string | null>>;

  const porLado = lados.map((lado) => {
    const [puntaInicio, puntaFin] = PUNTAS[lado];
    return rampaDeVereda(veredas[lado] ?? null, inicio.rampas[puntaInicio], fin.rampas[puntaFin]);
  });
  if (porLado.includes(true)) return true;
  if (porLado.every((rampa) => rampa === false)) return false;
  return null;
}

// En el vocabulario de OSM, el mismo que trae la importación.
const SUPERFICIE_OSM: Record<string, string> = {
  hormigón: 'concrete',
  baldosa: 'paving_stones',
  adoquín: 'sett',
  tierra: 'dirt',
  ripio: 'gravel',
  pasto: 'grass',
};

/** `superficie` de una cuadra. Una mixta cuenta como pavimentada si una silla de ruedas pasa por algún lado. */
export function superficieDeCuadra(cuadra: Cuadra) {
  if (cuadra.superficie === null || cuadra.superficie === 'no se ve') return null;
  if (cuadra.superficie !== 'mixta') return SUPERFICIE_OSM[cuadra.superficie] ?? null;
  if (cuadra.pasaSillaDeRuedas === 'no') return 'unpaved';
  if (cuadra.pasaSillaDeRuedas === 'sí' || cuadra.pasaSillaDeRuedas === 'solo por un lado') return 'paved';
  return null;
}

// Un tramo es de la cuadra si su punto medio cae entre las dos esquinas y a menos de esta distancia de la recta
// que las une. Alcanza para las dos manos de un bulevar, que quedan a unos 10 m del centro de la esquina.
const TOLERANCIA_METROS = 20;

/** Metros al este y al norte de `origen`. A la escala de unas cuadras, la Tierra se puede tomar plana. */
function enMetros([lon, lat]: [number, number], [lon0, lat0]: [number, number]): [number, number] {
  return [(lon - lon0) * 111_320 * Math.cos((lat0 * Math.PI) / 180), (lat - lat0) * 110_540];
}

/** El punto que está a mitad del largo de la traza, como [lon, lat]. */
function puntoMedio(puntos: [number, number][]): [number, number] {
  const origen = puntos[0]!;
  const largos = puntos.slice(1).map((p, i) => {
    const [x, y] = enMetros(p, puntos[i]!);
    return Math.hypot(x, y);
  });
  let resto = largos.reduce((suma, largo) => suma + largo, 0) / 2;
  for (const [i, largo] of largos.entries()) {
    if (resto <= largo) {
      const f = largo === 0 ? 0 : resto / largo;
      const [desde, hasta] = [puntos[i]!, puntos[i + 1]!];
      return [desde[0] + (hasta[0] - desde[0]) * f, desde[1] + (hasta[1] - desde[1]) * f];
    }
    resto -= largo;
  }
  return origen;
}

/** Si el tramo está sobre la cuadra que va de `a` a `b`: misma calle y su punto medio entre las dos esquinas. */
function estaEnCuadra(tramo: TramoRed, calle: string, a: Esquina, b: Esquina) {
  if (tramo.calle !== calle) return false;
  const origen: [number, number] = [a.lon, a.lat];
  const [bx, by] = enMetros([b.lon, b.lat], origen);
  const [px, py] = enMetros(puntoMedio(tramo.puntos), origen);
  const largo = Math.hypot(bx, by);
  if (largo === 0) return false;
  // Cuánto avanza el punto sobre la recta de a a b, y a qué distancia queda de ella.
  const avance = (px * bx + py * by) / largo;
  const distancia = Math.abs(px * by - py * bx) / largo;
  // El metro de margen deja afuera los tramos que solo cruzan el cantero de un bulevar en la esquina.
  return avance > 1 && avance < largo - 1 && distancia <= TOLERANCIA_METROS;
}

export interface ResumenRelevamiento {
  tramosCorregidos: number;
  nodosCorregidos: number;
  tramosQuitados: number;
  conexionesAgregadas: number;
  /** Esquinas, cuadras y puntos que no se encontraron en la red: si OSM cambió, hay que revisarlos. */
  sinUbicar: string[];
}

/**
 * Corrige la red armada con OSM con lo que se vio en el relevamiento, antes de cargarla:
 * - cada cuadra: `tiene_rampa`, `superficie` y `ancho_estimado` de sus tramos;
 * - cada esquina: `tiene_piso_podotactil` de sus nodos;
 * - cada punto revisado: quita los caminos que no son públicos y agrega las uniones que faltan.
 * Lo que no se vio ("no se ve") deja el valor de OSM. No cambia la red que recibe.
 */
export function aplicarRelevamiento(
  red: { nodos: NodoRed[]; tramos: TramoRed[] },
  relevamiento: Relevamiento,
): { nodos: NodoRed[]; tramos: TramoRed[]; resumen: ResumenRelevamiento } {
  const sinUbicar: string[] = [];

  const quitar = new Set(relevamiento.puntos.flatMap((punto) => punto.quitarCaminos ?? []));
  const tramos = red.tramos.filter((tramo) => !quitar.has(tramo.camino));
  const tramosQuitados = red.tramos.length - tramos.length;
  for (const punto of relevamiento.puntos) {
    const caminos = punto.quitarCaminos ?? [];
    if (caminos.some((camino) => !red.tramos.some((tramo) => tramo.camino === camino)))
      sinUbicar.push(punto.id);
  }

  const nodosPorOsm = new Map(red.nodos.map((nodo) => [nodo.osmId, nodo]));
  let conexionesAgregadas = 0;
  for (const punto of relevamiento.puntos) {
    if (!punto.conectarNodos) continue;
    const [desde, hasta] = punto.conectarNodos.map((id) => nodosPorOsm.get(id));
    if (!desde || !hasta) {
      sinUbicar.push(punto.id);
      continue;
    }
    const yaUnidos = tramos.some(
      (t) =>
        (t.nodoOrigen === desde.osmId && t.nodoDestino === hasta.osmId) ||
        (t.nodoOrigen === hasta.osmId && t.nodoDestino === desde.osmId),
    );
    if (yaUnidos) continue;
    tramos.push({
      camino: `relevamiento/${punto.id}`,
      calle: null,
      nodoOrigen: desde.osmId,
      nodoDestino: hasta.osmId,
      puntos: [
        [desde.lon, desde.lat],
        [hasta.lon, hasta.lat],
      ],
      tipo: 'VEREDA',
      tieneRampa: false,
      pendientePorcentaje: null,
      anchoEstimado: null,
      superficie: null,
    });
    conexionesAgregadas++;
  }

  const esquinas = new Map(relevamiento.esquinas.map((esquina) => [esquina.id, esquina]));
  let tramosCorregidos = 0;
  for (const cuadra of relevamiento.cuadras) {
    const extremos = cuadra.esquinas.map((id) => esquinas.get(id)!) as [Esquina, Esquina];
    const indices = tramos.flatMap((tramo, i) => (estaEnCuadra(tramo, cuadra.calle, ...extremos) ? [i] : []));
    if (indices.length === 0) {
      sinUbicar.push(cuadra.id);
      continue;
    }
    const rampa = rampaDeCuadra(cuadra, extremos);
    const superficie = superficieDeCuadra(cuadra);
    if (rampa === null && superficie === null && cuadra.anchoMetros === null) continue;
    for (const i of indices) {
      const tramo = tramos[i]!;
      tramos[i] = {
        ...tramo,
        tieneRampa: rampa ?? tramo.tieneRampa,
        superficie: superficie ?? tramo.superficie,
        anchoEstimado: cuadra.anchoMetros ?? tramo.anchoEstimado,
      };
      tramosCorregidos++;
    }
  }

  let nodosCorregidos = 0;
  const nodos = [...red.nodos];
  for (const esquina of relevamiento.esquinas) {
    const indices = nodos.flatMap((nodo, i) => (esquina.nodosOsm.includes(nodo.osmId) ? [i] : []));
    if (indices.length === 0) {
      sinUbicar.push(esquina.id);
      continue;
    }
    // El semáforo sonoro no se puede saber mirando Street View: queda el de OSM.
    if (esquina.pisoPodotactil !== 'sí' && esquina.pisoPodotactil !== 'no') continue;
    for (const i of indices) {
      nodos[i] = { ...nodos[i]!, tienePisoPodotactil: esquina.pisoPodotactil === 'sí' };
      nodosCorregidos++;
    }
  }

  return {
    nodos,
    tramos,
    resumen: { tramosCorregidos, nodosCorregidos, tramosQuitados, conexionesAgregadas, sinUbicar },
  };
}
