import type { TipoSenal } from '@prisma/client';

/** Parámetros verificacion.* (parametro_sistema). Los valores están explicados en docs/calculos.md. */
export interface ParametrosVerificacion {
  distanciaExifMaxM: number;
  hammingDuplicadoMax: number;
  diasFotoAntigua: number;
}

/** Lo que se sabe del reporte y de su foto al llegar. */
export interface DatosControles {
  /** El punto que mandó el vecino. */
  lat: number;
  lon: number;
  registradoEn: Date;
  exif: { latitud: number | null; longitud: number | null; tomadaEn: Date | null };
  /** Si el hash de la foto sirve para compararla (hashComparable): una foto lisa u oscura no. */
  hashComparable: boolean;
  /** La foto ya usada más parecida de otro reporte (del mismo vecino o de otro), o null si no hay. */
  fotoParecida: { reporteId: number; hamming: number; mismoVecino: boolean } | null;
}

export interface Senal {
  tipo: TipoSenal;
  /** 1 si el control se cumple, −1 si no y 0 si no hay con qué hacerlo. */
  valor: number;
  /** Qué se comprobó y qué dio, para que el operador lo entienda. */
  detalle: string;
}

/** En qué quedó cada control. Solo `ubicacion` COINCIDE prueba algo: lo demás descarta o no dice nada. */
export interface Controles {
  ubicacion: 'COINCIDE' | 'LEJOS' | 'SIN_UBICACION';
  antiguedad: 'RECIENTE' | 'VIEJA' | 'SIN_FECHA';
  foto: 'NUEVA' | 'REPETIDA' | 'SIN_COMPARAR';
}

export interface ResultadoControles {
  controles: Controles;
  senales: Senal[];
  /** Cuántos de los tres controles se cumplen, de 0 a 100 (nivel_confianza). */
  nivel: number;
}

const RADIO_TIERRA_M = 6_371_000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Distancia en metros entre dos puntos, por la fórmula de haversine (alcanza para distancias cortas). */
export function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (grados: number) => (grados * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(a));
}

/**
 * Los tres controles automáticos de un reporte (F04): dónde y cuándo se sacó la foto, y si ya se usó en otro
 * reporte. No deciden si se publica: son datos para la verificación con IA (ia/cola.ts) y para el operador.
 * Cada uno queda como una señal en senal_verificacion, con su explicación.
 */
export function evaluarControles(datos: DatosControles, p: ParametrosVerificacion): ResultadoControles {
  const ubicacion = controlUbicacion(datos, p);
  const antiguedad = controlAntiguedad(datos, p);
  const foto = controlFoto(datos, p);
  const senales = [ubicacion.senal, antiguedad.senal, foto.senal];
  const cumplidos = senales.filter((senal) => senal.valor > 0).length;
  return {
    controles: { ubicacion: ubicacion.resultado, antiguedad: antiguedad.resultado, foto: foto.resultado },
    senales,
    nivel: Math.round((100 * cumplidos) / senales.length),
  };
}

function controlUbicacion(datos: DatosControles, p: ParametrosVerificacion) {
  const { latitud, longitud } = datos.exif;
  if (latitud === null || longitud === null) {
    return {
      resultado: 'SIN_UBICACION' as const,
      senal: {
        tipo: 'EXIF_AUSENTE' as const,
        valor: 0,
        detalle: 'La foto no trae la ubicación donde se sacó',
      },
    };
  }
  const distancia = distanciaMetros(datos.lat, datos.lon, latitud, longitud);
  // Justo en el límite cuenta como que coincide.
  const coincide = distancia <= p.distanciaExifMaxM;
  const metros = Math.round(distancia);
  return {
    resultado: coincide ? ('COINCIDE' as const) : ('LEJOS' as const),
    // No hay un tipo propio para "no coincide": es la misma señal con valor negativo.
    senal: {
      tipo: 'EXIF_COINCIDE' as const,
      valor: coincide ? 1 : -1,
      detalle: coincide
        ? `La foto se sacó a ${metros} m del punto reportado (máximo ${p.distanciaExifMaxM} m)`
        : `La foto se sacó a ${metros} m del punto reportado, más lejos que el máximo de ${p.distanciaExifMaxM} m`,
    },
  };
}

function controlAntiguedad(datos: DatosControles, p: ParametrosVerificacion) {
  const { tomadaEn } = datos.exif;
  if (tomadaEn === null) {
    return {
      resultado: 'SIN_FECHA' as const,
      senal: { tipo: 'FECHA_ANTIGUA' as const, valor: 0, detalle: 'La foto no trae la fecha en que se sacó' },
    };
  }
  const dias = Math.max(0, (datos.registradoEn.getTime() - tomadaEn.getTime()) / DIA_MS);
  const vieja = dias > p.diasFotoAntigua;
  const cuando =
    Math.floor(dias) === 0 ? 'el mismo día del reporte' : `${Math.floor(dias)} días antes del reporte`;
  return {
    resultado: vieja ? ('VIEJA' as const) : ('RECIENTE' as const),
    // Como la ubicación: una sola señal, positiva si la foto es reciente y negativa si es vieja.
    senal: {
      tipo: 'FECHA_ANTIGUA' as const,
      valor: vieja ? -1 : 1,
      detalle: `La foto se sacó ${cuando} (máximo ${p.diasFotoAntigua} días)`,
    },
  };
}

function controlFoto(datos: DatosControles, p: ParametrosVerificacion) {
  if (!datos.hashComparable) {
    return {
      resultado: 'SIN_COMPARAR' as const,
      senal: {
        tipo: 'HASH_DUPLICADO' as const,
        valor: 0,
        detalle: 'La foto es lisa u oscura: no se puede saber si ya se usó en otro reporte',
      },
    };
  }
  const parecida = datos.fotoParecida;
  if (parecida && parecida.hamming <= p.hammingDuplicadoMax) {
    const quien = parecida.mismoVecino ? 'del mismo vecino' : 'de otro vecino';
    return {
      resultado: 'REPETIDA' as const,
      senal: {
        tipo: 'HASH_DUPLICADO' as const,
        valor: -1,
        detalle: `La misma foto ya se usó en el reporte ${parecida.reporteId}, ${quien}`,
      },
    };
  }
  return {
    resultado: 'NUEVA' as const,
    senal: { tipo: 'HASH_DUPLICADO' as const, valor: 1, detalle: 'La foto no se usó en otro reporte' },
  };
}

/**
 * Los controles de un reporte ya guardado, leídos de sus señales (senal_verificacion). Un reporte sin la señal
 * de un control (por ejemplo, uno anterior a los controles) cuenta como que no tiene con qué hacerlo.
 */
export function controlesDeSenales(senales: { tipo: TipoSenal; valor: number }[]): Controles {
  const valor = (tipo: TipoSenal) => senales.find((senal) => senal.tipo === tipo)?.valor;
  const ubicacion = valor('EXIF_COINCIDE');
  const fecha = valor('FECHA_ANTIGUA');
  const hash = valor('HASH_DUPLICADO');
  return {
    ubicacion: ubicacion === undefined ? 'SIN_UBICACION' : ubicacion > 0 ? 'COINCIDE' : 'LEJOS',
    antiguedad: fecha === undefined || fecha === 0 ? 'SIN_FECHA' : fecha > 0 ? 'RECIENTE' : 'VIEJA',
    foto: hash === undefined || hash === 0 ? 'SIN_COMPARAR' : hash > 0 ? 'NUEVA' : 'REPETIDA',
  };
}

/** Lo que respondió la IA al mirar la foto del reporte (ia/verificarFoto.ts). */
export interface AnalisisFoto {
  esProblemaViaPublica: boolean;
  /** Null si la foto no muestra un problema de la vía pública. */
  categoriaId: number | null;
  severidad: 'LEVE' | 'MODERADA' | 'GRAVE' | null;
  /** Si es el mismo problema que la foto de referencia. Null si no había referencia. */
  mismoProblema: boolean | null;
  /** Si se ve una cara reconocible o una patente legible. */
  datosPersonales: boolean;
}

export interface Decision {
  /** PUBLICAR lo verifica; REVISAR lo deja para un operador; DESESTIMAR lo deja pendiente de confirmación. */
  resultado: 'PUBLICAR' | 'REVISAR' | 'DESESTIMAR';
  /** Por qué, para el log del operador. */
  motivo: string;
  /** Cómo se probó el lugar, si se publica: la ubicación de la foto o un reporte ya verificado. */
  prueba?: 'UBICACION' | 'CORROBORADO';
}

/**
 * Qué hacer con un reporte pendiente después de que la IA miró su foto (F04). La IA dice qué muestra la foto;
 * dónde se sacó lo dicen los controles. Se publica solo si la foto muestra lo que eligió el vecino, sin datos
 * personales ni controles en contra, y el lugar está probado: por la ubicación de la foto o, si no la trae,
 * porque es el mismo problema que un reporte ya verificado del incidente. La IA nunca desestima: si la foto
 * no muestra un problema de la vía pública, lo deja para que un operador lo confirme.
 */
export function decidirVerificacion(datos: {
  analisis: AnalisisFoto;
  eligio: { categoriaId: number; severidad: string };
  controles: Controles;
}): Decision {
  const { analisis, eligio, controles } = datos;
  const revisar = (motivo: string): Decision => ({
    resultado: 'REVISAR',
    motivo: `${motivo}: queda para revisión manual`,
  });

  if (!analisis.esProblemaViaPublica) {
    return {
      resultado: 'DESESTIMAR',
      motivo:
        'La foto no muestra un problema de la vía pública: queda en los desestimados pendientes, para que un operador lo confirme',
    };
  }
  if (analisis.categoriaId !== eligio.categoriaId || analisis.severidad !== eligio.severidad) {
    return revisar('La IA ve otra categoría o gravedad que la que eligió el vecino');
  }
  if (analisis.datosPersonales) {
    return revisar('Se ve una cara o una patente: hay que revisar la foto antes de publicarla');
  }
  if (controles.foto === 'REPETIDA') return revisar('La foto ya se usó en otro reporte');
  if (controles.antiguedad === 'VIEJA') return revisar('La foto es vieja');
  if (controles.ubicacion === 'LEJOS') return revisar('La foto se sacó lejos del punto reportado');
  if (controles.ubicacion === 'COINCIDE') {
    return {
      resultado: 'PUBLICAR',
      prueba: 'UBICACION',
      motivo: 'Coincide con lo que eligió el vecino y la foto se sacó en el punto: publicado',
    };
  }
  if (analisis.mismoProblema === true) {
    return {
      resultado: 'PUBLICAR',
      prueba: 'CORROBORADO',
      motivo:
        'Coincide con lo que eligió el vecino y es el mismo problema que un reporte ya verificado del incidente: publicado',
    };
  }
  return revisar(
    analisis.mismoProblema === false
      ? 'La foto no trae ubicación y no parece el mismo problema que el reporte verificado del incidente'
      : 'La foto no trae ubicación y no hay un reporte verificado del incidente para compararla',
  );
}

/**
 * Reputación del vecino según su historial (F04): 100 × (confirmados + 1) / (confirmados + desestimados + 2),
 * con dos decimales como la columna. Sin historial da 50; cada reporte confirmado la acerca a 100 y cada
 * desestimado a 0, y el +1 y el +2 evitan que un solo reporte la lleve a un extremo. Ya no decide nada: el
 * operador la ve al revisar.
 */
export function calcularReputacion(confirmados: number, desestimados: number) {
  return Math.round((10_000 * (confirmados + 1)) / (confirmados + desestimados + 2)) / 100;
}
