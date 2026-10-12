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
