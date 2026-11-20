/**
 * El bloque TIFF de un EXIF que solo trae la ubicación, armado byte por byte: IFD0 con el puntero al IFD del GPS, y
 * el GPS con las referencias y los grados, minutos y segundos.
 */
/**
 * Las referencias del hemisferio que se graban: por defecto, las que corresponden al signo. Un texto vacío no
 * graba la entrada, como un EXIF al que le falta.
 */
export interface Referencias {
  lat?: string;
  lon?: string;
}

function tiffConGps(
  ubicacion: { lat: number; lon: number },
  intel: boolean,
  referencias: Referencias = {},
): number[] {
  const tiff: number[] = [];
  const u16 = (valor: number) =>
    intel ? [valor & 0xff, (valor >> 8) & 0xff] : [(valor >> 8) & 0xff, valor & 0xff];
  const u32 = (valor: number) => {
    const bytes = [(valor >>> 24) & 0xff, (valor >>> 16) & 0xff, (valor >>> 8) & 0xff, valor & 0xff];
    return intel ? bytes.reverse() : bytes;
  };
  /** Grados, minutos y segundos, cada uno como fracción con denominador 1, 1 y 100. */
  const fracciones = (grados: number) => {
    const absoluto = Math.abs(grados);
    const enteros = Math.floor(absoluto);
    const minutos = Math.floor((absoluto - enteros) * 60);
    const centesimas = Math.round(((absoluto - enteros) * 60 - minutos) * 60 * 100);
    return [...u32(enteros), ...u32(1), ...u32(minutos), ...u32(1), ...u32(centesimas), ...u32(100)];
  };

  // Encabezado TIFF: orden, 42 y dónde empieza el IFD0 (justo después, en el byte 8).
  tiff.push(...(intel ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  // IFD0 (en 8): una entrada, la del IFD del GPS, que empieza en 8 + 2 + 12 + 4 = 26.
  tiff.push(...u16(1), ...u16(0x8825), ...u16(4), ...u32(1), ...u32(26), ...u32(0));
  // IFD del GPS (en 26): cuatro entradas. Las fracciones van después: 26 + 2 + 4 × 12 + 4 = 80 y 80 + 24 = 104.
  // Una referencia que falta se graba con otra etiqueta (la 0x1b, que no se lee): así no cambia ningún desplazamiento.
  const ref = (letra: string) => [letra.charCodeAt(0), 0, 0, 0];
  const refLat = referencias.lat ?? (ubicacion.lat < 0 ? 'S' : 'N');
  const refLon = referencias.lon ?? (ubicacion.lon < 0 ? 'W' : 'E');
  tiff.push(
    ...u16(4),
    ...u16(refLat ? 1 : 0x1b),
    ...u16(2),
    ...u32(2),
    ...ref(refLat || ' '),
    ...u16(2),
    ...u16(5),
    ...u32(3),
    ...u32(80),
    ...u16(refLon ? 3 : 0x1b),
    ...u16(2),
    ...u32(2),
    ...ref(refLon || ' '),
    ...u16(4),
    ...u16(5),
    ...u32(3),
    ...u32(104),
    ...u32(0),
  );
  tiff.push(...fracciones(ubicacion.lat), ...fracciones(ubicacion.lon));
  return tiff;
}

/**
 * Un JPEG mínimo con ese EXIF: SOI, APP1 «Exif» con el bloque TIFF y EOI. No es una imagen que se pueda ver:
 * alcanza para probar cómo se lee la ubicación.
 */
export function jpegConGps(
  ubicacion: { lat: number; lon: number },
  { intel = false, referencias }: { intel?: boolean; referencias?: Referencias } = {},
): Uint8Array<ArrayBuffer> {
  const tiff = tiffConGps(ubicacion, intel, referencias);
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const largo = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (largo >> 8) & 0xff, largo & 0xff, ...app1, 0xff, 0xd9]);
}

/** Un JPEG mínimo sin EXIF. */
export const jpegSinGps = (): Uint8Array<ArrayBuffer> => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

/**
 * Una HEIC mínima (como las del iPhone) con ese EXIF y sin imagen: «ftyp», «meta» con un solo ítem, el «Exif»
 * («iinf» dice su tipo e «iloc» dónde está), y «mdat» con el ítem, que va después de todo el índice.
 */
export function heicConGps(ubicacion: { lat: number; lon: number }): Uint8Array<ArrayBuffer> {
  const u16 = (valor: number) => [(valor >> 8) & 0xff, valor & 0xff];
  const u32 = (valor: number) => [
    (valor >>> 24) & 0xff,
    (valor >>> 16) & 0xff,
    (valor >>> 8) & 0xff,
    valor & 0xff,
  ];
  const letras = (texto: string) => [...texto].map((letra) => letra.charCodeAt(0));
  const caja = (tipo: string, contenido: number[]) => [
    ...u32(8 + contenido.length),
    ...letras(tipo),
    ...contenido,
  ];
  const conVersion = (version: number) => [version, 0, 0, 0];

  const ftyp = caja('ftyp', [...letras('heic'), ...u32(0), ...letras('mif1')]);
  const infe = caja('infe', [...conVersion(2), ...u16(1), ...u16(0), ...letras('Exif'), 0]);
  const iinf = caja('iinf', [...conVersion(0), ...u16(1), ...infe]);
  const exif = [...u32(6), ...letras('Exif'), 0, 0, ...tiffConGps(ubicacion, false)];
  // «iloc» versión 1 (con método de construcción): desplazamiento y largo de 4 bytes, sin base ni índice.
  const iloc = (desde: number) =>
    caja('iloc', [
      ...conVersion(1),
      0x44,
      0x00,
      ...u16(1),
      ...u16(1),
      ...u16(0),
      ...u16(0),
      ...u16(1),
      ...u32(desde),
      ...u32(exif.length),
    ]);
  const meta = (desde: number) => caja('meta', [...conVersion(0), ...iinf, ...iloc(desde)]);
  // El ítem empieza después de ftyp, meta y la cabecera de mdat.
  const desde = ftyp.length + meta(0).length + 8;
  return new Uint8Array([...ftyp, ...meta(desde), ...caja('mdat', exif)]);
}
