import type { TipoPuntoInteres } from '@prisma/client';
import type { ElementoOsm } from './overpass.js';

/** Límite del Municipio de Neuquén en OSM: el ejido de la Municipalidad. */
export const RELACION_NEUQUEN = 3201700;

// Si un lugar tiene más de una, gana la primera: un centro de salud del gobierno cuenta como centro de
// salud, que suma más prioridad que un edificio público.
const ETIQUETAS: { clave: string; valor: string; tipo: TipoPuntoInteres }[] = [
  { clave: 'amenity', valor: 'school', tipo: 'ESCUELA' },
  { clave: 'amenity', valor: 'kindergarten', tipo: 'ESCUELA' },
  { clave: 'amenity', valor: 'hospital', tipo: 'CENTRO_SALUD' },
  { clave: 'amenity', valor: 'clinic', tipo: 'CENTRO_SALUD' },
  { clave: 'amenity', valor: 'doctors', tipo: 'CENTRO_SALUD' },
  { clave: 'highway', valor: 'bus_stop', tipo: 'PARADA_TRANSPORTE' },
  { clave: 'amenity', valor: 'townhall', tipo: 'EDIFICIO_PUBLICO' },
  { clave: 'office', valor: 'government', tipo: 'EDIFICIO_PUBLICO' },
];

/**
 * Pide los elementos (nodos, vías y relaciones) con alguna de las etiquetas dentro del municipio.
 * Escuelas y hospitales casi siempre están dibujados como áreas: "out center" da su centro.
 * Overpass numera el área de una relación como 3600000000 + el id de la relación.
 */
export const CONSULTA_PUNTOS_INTERES = [
  '[out:json][timeout:120];',
  `area(id:${3_600_000_000 + RELACION_NEUQUEN})->.ciudad;`,
  '(',
  ...ETIQUETAS.map(({ clave, valor }) => `  nwr["${clave}"="${valor}"](area.ciudad);`),
  ');',
  'out tags center;',
].join('\n');

// punto_interes.nombre es NOT NULL: los lugares sin nombre en OSM se guardan con el de su tipo.
export const NOMBRE_GENERICO: Record<TipoPuntoInteres, string> = {
  ESCUELA: 'Escuela',
  CENTRO_SALUD: 'Centro de salud',
  PARADA_TRANSPORTE: 'Parada de colectivo',
  EDIFICIO_PUBLICO: 'Edificio público',
};

// punto_interes.nombre es varchar(150).
const LARGO_NOMBRE = 150;

export interface PuntoInteresOsm {
  osmId: number;
  tipo: TipoPuntoInteres;
  nombre: string;
  lat: number;
  lon: number;
}

export interface Descarte {
  /** Como se escribe en OSM, por ejemplo "way/123". */
  elemento: string;
  motivo: string;
}

function tipoDe(etiquetas: Record<string, string>) {
  return ETIQUETAS.find(({ clave, valor }) => etiquetas[clave] === valor)?.tipo ?? null;
}

function nombreDe(etiquetas: Record<string, string>, tipo: TipoPuntoInteres) {
  const nombre = (etiquetas.name ?? '').replace(/\s+/g, ' ').trim();
  // Array.from recorta por caracteres, no por unidades de UTF-16: así no se parte una letra en dos.
  return Array.from(nombre || NOMBRE_GENERICO[tipo])
    .slice(0, LARGO_NOMBRE)
    .join('')
    .trim();
}

/** Convierte los elementos de Overpass en puntos para `punto_interes`, y dice cuáles no sirven y por qué. */
export function aPuntosInteres(elementos: ElementoOsm[]) {
  const puntos: PuntoInteresOsm[] = [];
  const descartados: Descarte[] = [];
  // osm_id es único en la tabla, pero en OSM el número se repite entre clases: puede haber un
  // node/5 y un way/5. Si pasa, se carga el primero y se avisa.
  const usados = new Map<number, string>();

  for (const elemento of elementos) {
    const nombreElemento = `${elemento.type}/${elemento.id}`;
    const tipo = tipoDe(elemento.tags ?? {});
    const lat = elemento.lat ?? elemento.center?.lat;
    const lon = elemento.lon ?? elemento.center?.lon;

    if (!tipo) {
      descartados.push({ elemento: nombreElemento, motivo: 'no tiene una etiqueta de punto de interés' });
    } else if (lat === undefined || lon === undefined) {
      descartados.push({ elemento: nombreElemento, motivo: 'no tiene coordenadas' });
    } else if (usados.has(elemento.id)) {
      descartados.push({
        elemento: nombreElemento,
        motivo: `el osm_id ${elemento.id} ya lo usa ${usados.get(elemento.id)}`,
      });
    } else {
      usados.set(elemento.id, nombreElemento);
      puntos.push({ osmId: elemento.id, tipo, nombre: nombreDe(elemento.tags ?? {}, tipo), lat, lon });
    }
  }

  return { puntos, descartados };
}
