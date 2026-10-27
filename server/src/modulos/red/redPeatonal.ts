import type { TipoTramo } from '@prisma/client';
import type { ElementoOsm } from './overpass.js';
import type { Descarte } from './puntosInteres.js';

// En Neuquén casi no hay veredas mapeadas aparte: la calle es la aproximación de sus dos veredas.
const CALLES = [
  'living_street',
  'residential',
  'unclassified',
  'tertiary',
  'secondary',
  'primary',
  'service',
];
// Caminos hechos para caminar: sus etiquetas describen lo que pisa el peatón.
const CAMINOS = ['footway', 'pedestrian', 'path', 'steps', 'track', 'cycleway'];

export const TIPOS_CAMINO = [...CAMINOS, ...CALLES];

const SERVICIOS_EXCLUIDOS = ['parking_aisle', 'driveway', 'drive-through'];
const PEATON_PERMITIDO = ['yes', 'designated', 'permissive'];
const CON_RAMPA = ['lowered', 'flush'];
const SEMAFORO_SONORO = ['yes', 'walk', 'locate'];
const PISO_PODOTACTIL = ['yes', 'contrasted', 'primitive'];

// Topes de las columnas: numeric(5,2), numeric(4,2) y varchar(40).
const PENDIENTE_MAX = 999.99;
const ANCHO_MAX = 99.99;
const LARGO_SUPERFICIE = 40;

/** Anillo exterior de un polígono, como pares [lon, lat] (el orden de GeoJSON). */
export type Anillo = [number, number][];

/**
 * Pide los caminos con alguno de los tipos de `TIPOS_CAMINO` que tocan alguna de las zonas, con sus nodos.
 * Overpass recibe el polígono como "lat lon lat lon ...", al revés que GeoJSON.
 */
export function consultaRed(zonas: Anillo[]) {
  const filtro = `["highway"~"^(${TIPOS_CAMINO.join('|')})$"]`;
  return [
    '[out:json][timeout:180];',
    '(',
    ...zonas.map(
      (anillo) => `  way${filtro}(poly:"${anillo.map(([lon, lat]) => `${lat} ${lon}`).join(' ')}");`,
    ),
    ');',
    // Suma los nodos de cada camino: sus coordenadas y sus etiquetas (semáforo, piso podotáctil, cordón).
    '(._;>;);',
    'out body;',
  ].join('\n');
}

export interface NodoRed {
  osmId: number;
  lat: number;
  lon: number;
  tieneSemaforoSonoro: boolean;
  tienePisoPodotactil: boolean;
}

export interface TramoRed {
  /** El camino de OSM del que sale, como "way/123". */
  camino: string;
  /** osm_id de los nodos de los extremos. */
  nodoOrigen: number;
  nodoDestino: number;
  /** La traza como pares [lon, lat], del origen al destino. */
  puntos: [number, number][];
  tipo: TipoTramo;
  tieneRampa: boolean;
  pendientePorcentaje: number | null;
  anchoEstimado: number | null;
  superficie: string | null;
}

type Etiquetas = Record<string, string>;

function motivoDescarte(etiquetas: Etiquetas): string | null {
  const highway = etiquetas.highway ?? '';
  const peatonPermitido = PEATON_PERMITIDO.includes(etiquetas.foot ?? '');

  if (!TIPOS_CAMINO.includes(highway)) return 'no es un camino para peatones';
  if (etiquetas.foot === 'no') return 'prohibido para peatones (foot=no)';
  if (['private', 'no'].includes(etiquetas.access ?? '') && !peatonPermitido) return 'acceso privado';
  if (highway === 'cycleway' && !peatonPermitido) return 'ciclovía sin paso de peatones';
  if (highway === 'service' && SERVICIOS_EXCLUIDOS.includes(etiquetas.service ?? '')) {
    return 'estacionamiento o entrada de garage';
  }
  // Si las veredas ya están dibujadas, la calle sobra: un recorrido podría esquivar por ella un obstáculo
  // de la vereda real.
  if (CALLES.includes(highway) && [etiquetas.sidewalk, etiquetas['sidewalk:both']].includes('separate')) {
    return 'las veredas están mapeadas aparte (sidewalk=separate)';
  }
  return null;
}

function tipoDe(etiquetas: Etiquetas, esCalle: boolean): TipoTramo {
  if (etiquetas.highway === 'steps') return 'ESCALERA';
  if (!esCalle && [etiquetas.footway, etiquetas.path, etiquetas.cycleway].includes('crossing'))
    return 'CRUCE';
  if (etiquetas.highway === 'path' || etiquetas.highway === 'track') return 'SENDA';
  return 'VEREDA';
}

/** Redondea a 2 decimales; null si no entra en la columna. */
function enRango(valor: number, maximo: number) {
  const redondeado = Math.round(valor * 100) / 100;
  return Number.isFinite(redondeado) && Math.abs(redondeado) <= maximo ? redondeado : null;
}

/** `incline` en porcentaje: "8%", "-5 %", "8" (se toma como %) o "4°". "up", "down" y lo demás no dicen cuánto: null. */
export function leerPendiente(valor: string | undefined) {
  const partes = valor?.trim().match(/^([+-]?\d+(?:[.,]\d+)?)\s*(%|°)?$/);
  if (!partes?.[1]) return null;
  const numero = Number(partes[1].replace(',', '.'));
  if (partes[2] !== '°') return enRango(numero, PENDIENTE_MAX);
  return Math.abs(numero) < 90 ? enRango(Math.tan((numero * Math.PI) / 180) * 100, PENDIENTE_MAX) : null;
}

/** `width` en metros: "1.5", "1,5 m" o "150 cm". Otras unidades o valores que no entran en la columna: null. */
export function leerAncho(valor: string | undefined) {
  const partes = valor?.trim().match(/^(\d+(?:[.,]\d+)?)\s*(m|cm)?$/);
  if (!partes?.[1]) return null;
  const metros = Number(partes[1].replace(',', '.')) / (partes[2] === 'cm' ? 100 : 1);
  return metros > 0 ? enRango(metros, ANCHO_MAX) : null;
}

function leerSuperficie(valor: string | undefined) {
  // Array.from recorta por caracteres, no por unidades de UTF-16: así no se parte una letra en dos.
  const superficie = Array.from((valor ?? '').trim())
    .slice(0, LARGO_SUPERFICIE)
    .join('')
    .trim();
  return superficie || null;
}

/** Un tramo que vuelve a su nodo de partida se parte en dos en el nodo del medio: la base no acepta lazos. */
function sinLazos(nodos: number[]): number[][] {
  if (nodos[0] !== nodos.at(-1)) return [nodos];
  const medio = Math.floor(nodos.length / 2);
  return [nodos.slice(0, medio + 1), nodos.slice(medio)];
}

/**
 * Convierte los caminos y nodos de Overpass en la red peatonal: cada camino se corta en los nodos que comparte
 * con otro (las esquinas) y en sus extremos. Devuelve los nodos del grafo, los tramos y los caminos que no
 * entran, con el motivo. No mira la zona: eso lo resuelve la base al cargar.
 */
export function armarRed(elementos: ElementoOsm[]) {
  const nodosOsm = new Map<number, ElementoOsm & { lat: number; lon: number }>();
  for (const elemento of elementos) {
    if (elemento.type === 'node' && elemento.lat !== undefined && elemento.lon !== undefined) {
      nodosOsm.set(elemento.id, { ...elemento, lat: elemento.lat, lon: elemento.lon });
    }
  }

  const descartados: Descarte[] = [];
  const caminos: { camino: ElementoOsm; nodos: number[] }[] = [];
  // Por número de vía, para que la misma respuesta dé siempre los tramos en el mismo orden.
  const vias = elementos.filter((elemento) => elemento.type === 'way').sort((a, b) => a.id - b.id);
  for (const camino of vias) {
    const nombre = `way/${camino.id}`;
    // Un nodo repetido seguido no le agrega nada a la traza.
    const nodos = (camino.nodes ?? []).filter((id, i, lista) => id !== lista[i - 1]);
    const motivo = motivoDescarte(camino.tags ?? {});
    const faltante = nodos.find((id) => !nodosOsm.has(id));

    if (motivo) descartados.push({ elemento: nombre, motivo });
    else if (nodos.length < 2) descartados.push({ elemento: nombre, motivo: 'tiene menos de dos nodos' });
    else if (faltante !== undefined) {
      descartados.push({ elemento: nombre, motivo: `la respuesta no trae el nodo ${faltante}` });
    } else caminos.push({ camino, nodos });
  }

  // Un nodo que aparece más de una vez es una esquina: lo comparten dos caminos o un camino pasa dos veces.
  const apariciones = new Map<number, number>();
  for (const { nodos } of caminos) {
    for (const id of nodos) apariciones.set(id, (apariciones.get(id) ?? 0) + 1);
  }

  const tramos: TramoRed[] = [];
  for (const { camino, nodos } of caminos) {
    let desde = 0;
    for (let i = 1; i < nodos.length; i++) {
      if (i < nodos.length - 1 && apariciones.get(nodos[i]!)! < 2) continue;
      for (const parte of sinLazos(nodos.slice(desde, i + 1)))
        tramos.push(armarTramo(camino, parte, nodosOsm));
      desde = i;
    }
  }

  const enTramos = new Set(tramos.flatMap((tramo) => [tramo.nodoOrigen, tramo.nodoDestino]));
  const nodos: NodoRed[] = [...enTramos]
    .sort((a, b) => a - b)
    .map((id) => {
      const { lat, lon, tags = {} } = nodosOsm.get(id)!;
      return {
        osmId: id,
        lat,
        lon,
        tieneSemaforoSonoro: SEMAFORO_SONORO.includes(tags['traffic_signals:sound'] ?? ''),
        tienePisoPodotactil: PISO_PODOTACTIL.includes(tags.tactile_paving ?? ''),
      };
    });

  return { nodos, tramos, descartados };
}

function armarTramo(
  camino: ElementoOsm,
  nodos: number[],
  nodosOsm: Map<number, ElementoOsm & { lat: number; lon: number }>,
): TramoRed {
  const etiquetas = camino.tags ?? {};
  const esCalle = CALLES.includes(etiquetas.highway ?? '');
  const puntos = nodos.map((id) => nodosOsm.get(id)!);
  // El cordón rebajado casi siempre se marca en un nodo (barrier=kerb), no en el camino.
  const etiquetasConCordon = [etiquetas, ...puntos.map((punto) => punto.tags ?? {})];

  return {
    camino: `way/${camino.id}`,
    nodoOrigen: nodos[0]!,
    nodoDestino: nodos.at(-1)!,
    puntos: puntos.map(({ lon, lat }) => [lon, lat]),
    tipo: tipoDe(etiquetas, esCalle),
    tieneRampa: etiquetasConCordon.some((t) => CON_RAMPA.includes(t.kerb ?? '')),
    pendientePorcentaje: leerPendiente(etiquetas.incline),
    // En una calle, el ancho y la superficie son los de la calzada, no los de la vereda.
    anchoEstimado: esCalle ? null : leerAncho(etiquetas.width),
    superficie: esCalle ? null : leerSuperficie(etiquetas.surface),
  };
}
