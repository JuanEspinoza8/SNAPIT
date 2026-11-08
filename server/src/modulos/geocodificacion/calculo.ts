/** El barrio de una dirección que no lo tiene. También sirve como valor del filtro del mapa. */
export const SIN_BARRIO = 'Sin barrio';

/** Lo que Nominatim devuelve en `address`. Las claves dependen de cómo esté cargado el lugar en OSM. */
export type DireccionNominatim = Record<string, unknown>;

// En Neuquén el barrio casi siempre llega como suburb; algunos, como city_district.
const CLAVES_BARRIO = ['suburb', 'city_district', 'quarter', 'neighbourhood'];
const CLAVES_CALLE = ['road', 'pedestrian', 'footway', 'path', 'cycleway'];

// reporte.direccion e incidente.direccion son varchar(250).
const LARGO_DIRECCION = 250;
const LARGO_BARRIO = 100;

/** Saca las comas (la última separa la calle del barrio) y los espacios de más. */
function limpiar(valor: unknown) {
  return typeof valor === 'string' ? valor.replace(/,/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function primeraConValor(direccion: DireccionNominatim, claves: string[]) {
  for (const clave of claves) {
    const valor = limpiar(direccion[clave]);
    if (valor) return valor;
  }
  return '';
}

/**
 * El texto que se guarda en `direccion`: "<calle> <altura>, <barrio>". Sin barrio queda
 * "<calle> <altura>, Sin barrio"; sin calle, solo el barrio; sin nada, "Sin barrio".
 */
export function armarDireccion(direccion: DireccionNominatim | null): string {
  const datos = direccion ?? {};
  const barrio = primeraConValor(datos, CLAVES_BARRIO).slice(0, LARGO_BARRIO).trim() || SIN_BARRIO;
  const nombreCalle = primeraConValor(datos, CLAVES_CALLE);
  if (!nombreCalle) return barrio;

  const calle = [nombreCalle, limpiar(datos.house_number)].filter(Boolean).join(' ');
  // Si no entra, se recorta la calle: el barrio tiene que quedar entero después de la coma.
  const lugarParaCalle = LARGO_DIRECCION - barrio.length - ', '.length;
  return `${calle.slice(0, lugarParaCalle).trim()}, ${barrio}`;
}

/**
 * El barrio de una dirección guardada: lo que está después de la última coma, o el texto entero si no
 * tiene coma. La misma regla está en SQL, en BARRIO (incidentes/repositorio.ts), y un test controla
 * que las dos coincidan.
 */
export function extraerBarrio(direccion: string): string {
  return direccion.slice(direccion.lastIndexOf(',') + 1).trim() || SIN_BARRIO;
}

/** Un rectángulo en grados. */
export interface Caja {
  oeste: number;
  sur: number;
  este: number;
  norte: number;
}

/**
 * El rectángulo que encierra al municipio de Neuquén en OSM (boundingbox de la ciudad en Nominatim, 02/11/2026).
 * No alcanza solo: el centro de Cipolletti, del otro lado del río, también cae adentro.
 */
export const NEUQUEN_CAPITAL: Caja = { oeste: -68.2019, sur: -38.9956, este: -67.9987, norte: -38.8815 };

/** Un resultado de la búsqueda de Nominatim, con su dirección. */
export interface ResultadoBusqueda {
  lat: number;
  lon: number;
  /** El nombre del lugar (un hospital, una plaza); vacío si es una dirección. */
  name?: string;
  address?: DireccionNominatim;
}

export interface Lugar {
  nombre: string;
  lat: number;
  lon: number;
}

const dentroDe = (caja: Caja, { lat, lon }: { lat: number; lon: number }) =>
  lon >= caja.oeste && lon <= caja.este && lat >= caja.sur && lat <= caja.norte;

/**
 * Si la dirección es de la ciudad de Neuquén. Nominatim la marca con city «Neuquén» y municipality «Municipio de
 * Neuquén»; las de Cipolletti dicen «Municipio de Cipolletti» y las de Plottier o Centenario, su ciudad.
 */
export function esDeNeuquenCapital(direccion: DireccionNominatim | undefined) {
  return direccion?.city === 'Neuquén' || direccion?.municipality === 'Municipio de Neuquén';
}

/** "<nombre del lugar>, <calle> <altura>, <barrio>". Sin nombre propio (o si es el de la calle), solo la dirección. */
export function nombreDelLugar({ name, address }: ResultadoBusqueda) {
  const direccion = armarDireccion(address ?? null);
  const propio = limpiar(name);
  return propio && propio !== primeraConValor(address ?? {}, CLAVES_CALLE)
    ? `${propio}, ${direccion}`
    : direccion;
}

/** Los lugares de la búsqueda que son de Neuquén Capital, como los devuelve la API. */
export function aLugares(resultados: ResultadoBusqueda[], maximo = 5): Lugar[] {
  return resultados
    .filter((resultado) => dentroDe(NEUQUEN_CAPITAL, resultado) && esDeNeuquenCapital(resultado.address))
    .slice(0, maximo)
    .map((resultado) => ({ nombre: nombreDelLugar(resultado), lat: resultado.lat, lon: resultado.lon }));
}
