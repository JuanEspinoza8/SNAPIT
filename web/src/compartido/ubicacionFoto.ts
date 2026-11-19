/** Un punto en grados, como lo usan el mapa y la API. */
export interface Punto {
  lat: number;
  lon: number;
}

// El EXIF del JPEG y el índice de la HEIC van al principio: alcanza con leer el comienzo, no la foto entera.
const BYTES_A_LEER = 256 * 1024;

/**
 * Dónde se sacó la foto, según su EXIF: la usa el formulario de reporte para completar el punto solo. Null si no
 * es un JPEG o una HEIC, si no trae ubicación o si no se puede leer: entonces el vecino marca el punto a mano.
 */
export async function ubicacionDeLaFoto(archivo: Blob): Promise<Punto | null> {
  try {
    const comienzo = new DataView(await archivo.slice(0, BYTES_A_LEER).arrayBuffer());
    const exif = dondeEstaElExifHeif(comienzo);
    if (!exif) return leerUbicacion(comienzo);
    // En la HEIC el EXIF puede estar en cualquier parte del archivo: se lee solo ese pedazo.
    return leerExifHeif(new DataView(await archivo.slice(exif.desde, exif.desde + exif.largo).arrayBuffer()));
  } catch {
    return null;
  }
}

const SOI = 0xffd8; // comienzo de un JPEG
const APP1 = 0xffe1; // donde va el EXIF
const SOS = 0xffda; // comienza la imagen: ya no hay más metadatos
const EXIF = 0x45786966; // «Exif»
const GPS_IFD = 0x8825;

/** La ubicación del EXIF de un JPEG, recorriendo sus segmentos hasta el APP1 «Exif». */
export function leerUbicacion(vista: DataView): Punto | null {
  if (vista.byteLength < 4 || vista.getUint16(0) !== SOI) return null;
  let posicion = 2;
  while (posicion + 4 <= vista.byteLength) {
    const marca = vista.getUint16(posicion);
    if (marca >> 8 !== 0xff || marca === SOS) return null;
    const largo = vista.getUint16(posicion + 2);
    if (marca === APP1 && vista.getUint32(posicion + 4) === EXIF) return gpsDelTiff(vista, posicion + 10);
    posicion += 2 + largo;
  }
  return null;
}

/** Una caja de un archivo HEIF (ISOBMFF): su tipo y dónde empieza y termina su contenido. */
interface Caja {
  tipo: string;
  contenido: number;
  fin: number;
}

const texto4 = (vista: DataView, en: number) =>
  String.fromCharCode(
    vista.getUint8(en),
    vista.getUint8(en + 1),
    vista.getUint8(en + 2),
    vista.getUint8(en + 3),
  );

/** Las cajas que hay entre `desde` y `hasta`. */
function cajas(vista: DataView, desde: number, hasta: number): Caja[] {
  const lista: Caja[] = [];
  let en = desde;
  while (en + 8 <= hasta) {
    let largo = vista.getUint32(en);
    let cabecera = 8;
    if (largo === 1) {
      largo = Number(vista.getBigUint64(en + 8));
      cabecera = 16;
    } else if (largo === 0) {
      largo = hasta - en; // llega hasta el final del archivo
    }
    if (largo < cabecera) break;
    lista.push({ tipo: texto4(vista, en + 4), contenido: en + cabecera, fin: Math.min(en + largo, hasta) });
    en += largo;
  }
  return lista;
}

/** Lee un entero sin signo de 0, 2, 4 u 8 bytes, como los usa la caja «iloc». */
function entero(vista: DataView, en: number, bytes: number): number {
  if (bytes === 0) return 0;
  if (bytes === 2) return vista.getUint16(en);
  if (bytes === 4) return vista.getUint32(en);
  if (bytes === 8) return Number(vista.getBigUint64(en));
  throw new Error('Tamaño de entero inesperado');
}

/**
 * En una HEIC (las fotos del iPhone), dónde está el EXIF. La caja «meta» lista los ítems del archivo («iinf») y
 * dónde está cada uno («iloc»): se busca el de tipo «Exif». Null si no es una HEIC o no trae EXIF.
 */
export function dondeEstaElExifHeif(vista: DataView): { desde: number; largo: number } | null {
  if (vista.byteLength < 12 || texto4(vista, 4) !== 'ftyp') return null;
  const meta = cajas(vista, 0, vista.byteLength).find((caja) => caja.tipo === 'meta');
  if (!meta) return null;
  // «meta», «iinf», «infe» e «iloc» empiezan con versión (1 byte) y banderas (3 bytes).
  const hijas = cajas(vista, meta.contenido + 4, meta.fin);
  const iinf = hijas.find((caja) => caja.tipo === 'iinf');
  const iloc = hijas.find((caja) => caja.tipo === 'iloc');
  if (!iinf || !iloc) return null;

  const versionIinf = vista.getUint8(iinf.contenido);
  const item = cajas(vista, iinf.contenido + (versionIinf === 0 ? 6 : 8), iinf.fin)
    .filter((caja) => caja.tipo === 'infe' && vista.getUint8(caja.contenido) >= 2)
    .map((caja) => {
      const version = vista.getUint8(caja.contenido);
      const id = version === 2 ? vista.getUint16(caja.contenido + 4) : vista.getUint32(caja.contenido + 4);
      return { id, tipo: texto4(vista, caja.contenido + (version === 2 ? 8 : 10)) };
    })
    .find((infe) => infe.tipo === 'Exif');
  if (!item) return null;

  const version = vista.getUint8(iloc.contenido);
  let en = iloc.contenido + 4;
  const tamanos = vista.getUint16(en);
  const conMetodo = version === 1 || version === 2;
  // Cuántos bytes ocupa cada número: el desplazamiento, el largo, la base y el índice de cada pedazo.
  const offset = tamanos >> 12;
  const largo = (tamanos >> 8) & 0xf;
  const base = (tamanos >> 4) & 0xf;
  const indice = conMetodo ? tamanos & 0xf : 0;
  en += 2;
  const cantidad = version < 2 ? vista.getUint16(en) : vista.getUint32(en);
  en += version < 2 ? 2 : 4;
  for (let i = 0; i < cantidad; i++) {
    const id = version < 2 ? vista.getUint16(en) : vista.getUint32(en);
    en += version < 2 ? 2 : 4;
    // Método de construcción: 0 es «en el archivo», el único que se usa para el EXIF de una foto.
    const metodo = conMetodo ? vista.getUint16(en) & 0xf : 0;
    if (conMetodo) en += 2;
    en += 2; // índice de la referencia de datos
    const desdeBase = entero(vista, en, base);
    en += base;
    const pedazos = vista.getUint16(en);
    en += 2;
    if (id === item.id) {
      if (metodo !== 0 || pedazos < 1) return null;
      return {
        desde: desdeBase + entero(vista, en + indice, offset),
        largo: entero(vista, en + indice + offset, largo),
      };
    }
    en += pedazos * (indice + offset + largo);
  }
  return null;
}

/** El ítem «Exif» de una HEIC: dice cuántos bytes saltear hasta el bloque TIFF (después del «Exif\0\0»). */
export function leerExifHeif(vista: DataView): Punto | null {
  if (vista.byteLength < 4) return null;
  return gpsDelTiff(vista, 4 + vista.getUint32(0));
}

/** El bloque TIFF del EXIF: su IFD0 apunta al IFD del GPS, que tiene la latitud y la longitud. */
function gpsDelTiff(vista: DataView, inicio: number): Punto | null {
  const orden = vista.getUint16(inicio);
  if (orden !== 0x4949 && orden !== 0x4d4d) return null;
  const intel = orden === 0x4949; // «II»: los números van al revés (little endian)
  const u16 = (desde: number) => vista.getUint16(inicio + desde, intel);
  const u32 = (desde: number) => vista.getUint32(inicio + desde, intel);
  if (u16(2) !== 42) return null;

  /** Las entradas de un IFD: etiqueta y dónde empieza cada una (el valor va 8 bytes después). */
  const entradas = (ifd: number) => {
    const cantidad = u16(ifd);
    return Array.from({ length: cantidad }, (_, i) => ({
      etiqueta: u16(ifd + 2 + i * 12),
      en: ifd + 2 + i * 12,
    }));
  };
  const gps = entradas(u32(4)).find((entrada) => entrada.etiqueta === GPS_IFD);
  if (!gps) return null;
  const delGps = new Map(entradas(u32(gps.en + 8)).map((entrada) => [entrada.etiqueta, entrada.en]));

  // La referencia (N/S, E/O) es un texto de un carácter, guardado dentro de la entrada.
  const referencia = (etiqueta: number) => {
    const en = delGps.get(etiqueta);
    return en === undefined ? null : String.fromCharCode(vista.getUint8(inicio + en + 8));
  };
  // Grados, minutos y segundos: tres fracciones guardadas afuera de la entrada.
  const grados = (etiqueta: number) => {
    const en = delGps.get(etiqueta);
    if (en === undefined) return null;
    const desde = u32(en + 8);
    const fraccion = (i: number) => u32(desde + i * 8) / u32(desde + i * 8 + 4);
    return fraccion(0) + fraccion(1) / 60 + fraccion(2) / 3600;
  };

  const lat = grados(2);
  const lon = grados(4);
  if (lat === null || lon === null) return null;
  const punto = {
    lat: referencia(1) === 'S' ? -lat : lat,
    lon: referencia(3) === 'W' ? -lon : lon,
  };
  // Un GPS sin señal a veces graba 0, 0: no es un lugar.
  const valido =
    Number.isFinite(punto.lat) &&
    Number.isFinite(punto.lon) &&
    Math.abs(punto.lat) <= 90 &&
    Math.abs(punto.lon) <= 180 &&
    !(punto.lat === 0 && punto.lon === 0);
  return valido ? punto : null;
}
