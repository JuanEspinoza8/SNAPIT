import type { EstadoVerificacion, TipoSenal } from '@prisma/client';

/** Parámetros verificacion.* (parametro_sistema). Los valores están explicados en docs/calculos.md. */
export interface ParametrosVerificacion {
  confianzaBase: number;
  umbralVerificado: number;
  distanciaExifMaxM: number;
  valorExifCoincide: number;
  valorExifNoCoincide: number;
  valorExifAusente: number;
  hammingDuplicadoMax: number;
  valorHashDuplicado: number;
  valorOrigenApp: number;
  valorReputacionMax: number;
  diasFotoAntigua: number;
  valorFechaAntigua: number;
}

/** Lo que se sabe del reporte y de su foto al llegar. */
export interface DatosConfianza {
  /** El punto que mandó el vecino. */
  lat: number;
  lon: number;
  registradoEn: Date;
  tomadaConCamaraApp: boolean;
  exif: { latitud: number | null; longitud: number | null; tomadaEn: Date | null };
  /** Reputación del vecino, de 0 a 100. */
  reputacion: number;
  /** La foto ya usada más parecida de otro reporte (del mismo vecino o de otro), o null si no hay. */
  fotoParecida: { reporteId: number; hamming: number; mismoVecino: boolean } | null;
}

export interface Senal {
  tipo: TipoSenal;
  valor: number;
  /** Por qué sumó o restó, para que el operador lo entienda. */
  detalle: string;
}

export interface ResultadoConfianza {
  nivel: number;
  senales: Senal[];
  /** El sistema solo verifica o deja pendiente: desestimar es siempre una decisión de una persona. */
  estado: Extract<EstadoVerificacion, 'VERIFICADO' | 'PENDIENTE_REVISION'>;
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

const redondear = (valor: number, decimales = 2) => Number(valor.toFixed(decimales));

/**
 * Nivel de confianza de un reporte, de 0 a 100 (F04):
 *
 *   nivel = recortar(confianza_base + Σ señales, 0, 100)
 *
 * Queda VERIFICADO desde umbral_verificado y PENDIENTE_REVISION por debajo. Nunca DESESTIMADO.
 */
export function calcularConfianza(datos: DatosConfianza, p: ParametrosVerificacion): ResultadoConfianza {
  const senales: Senal[] = [];

  // Ubicación de la foto contra el punto enviado.
  const { latitud, longitud, tomadaEn } = datos.exif;
  if (latitud !== null && longitud !== null) {
    const metros = distanciaMetros(datos.lat, datos.lon, latitud, longitud);
    senales.push(
      metros <= p.distanciaExifMaxM
        ? {
            tipo: 'EXIF_COINCIDE',
            valor: p.valorExifCoincide,
            detalle: `La foto se sacó a ${Math.round(metros)} m del punto reportado (máximo ${p.distanciaExifMaxM} m)`,
          }
        : {
            // No hay un tipo propio para "no coincide": es la misma señal con valor negativo.
            tipo: 'EXIF_COINCIDE',
            valor: p.valorExifNoCoincide,
            detalle: `La foto se sacó a ${Math.round(metros)} m del punto reportado, más lejos que el máximo de ${p.distanciaExifMaxM} m`,
          },
    );
  } else if (!datos.tomadaConCamaraApp) {
    // La cámara de la app puede no grabar ubicación en la foto: solo se penaliza una foto de galería.
    senales.push({
      tipo: 'EXIF_AUSENTE',
      valor: p.valorExifAusente,
      detalle: 'La foto se eligió de la galería y no trae la ubicación donde se sacó',
    });
  }

  if (datos.fotoParecida && datos.fotoParecida.hamming <= p.hammingDuplicadoMax) {
    const quien = datos.fotoParecida.mismoVecino ? 'del mismo vecino' : 'de otro vecino';
    senales.push({
      tipo: 'HASH_DUPLICADO',
      valor: p.valorHashDuplicado,
      detalle: `La misma foto ya se usó en el reporte ${datos.fotoParecida.reporteId}, ${quien}`,
    });
  }

  if (datos.tomadaConCamaraApp) {
    senales.push({
      tipo: 'ORIGEN_APP',
      valor: p.valorOrigenApp,
      detalle: 'La foto se sacó con la cámara de la app en el momento',
    });
  }

  // Reputación 50 (la inicial) no mueve nada; 0 resta el máximo y 100 lo suma.
  const reputacion = Math.min(100, Math.max(0, datos.reputacion));
  const porReputacion = redondear((p.valorReputacionMax * (reputacion - 50)) / 50);
  senales.push({
    tipo: 'REPUTACION',
    valor: porReputacion,
    detalle: `Reputación del vecino: ${redondear(reputacion)} de 100`,
  });

  if (tomadaEn !== null) {
    const dias = (datos.registradoEn.getTime() - tomadaEn.getTime()) / DIA_MS;
    if (dias > p.diasFotoAntigua) {
      senales.push({
        tipo: 'FECHA_ANTIGUA',
        valor: p.valorFechaAntigua,
        detalle: `La foto se sacó ${Math.floor(dias)} días antes del reporte (máximo ${p.diasFotoAntigua})`,
      });
    }
  }

  const suma = senales.reduce((total, senal) => total + senal.valor, p.confianzaBase);
  // nivel_confianza es un entero entre 0 y 100 (CHECK de la base).
  const nivel = Math.round(Math.min(100, Math.max(0, suma)));
  return { nivel, senales, estado: nivel >= p.umbralVerificado ? 'VERIFICADO' : 'PENDIENTE_REVISION' };
}

/**
 * Reputación del vecino según su historial (F04): 100 × (confirmados + 1) / (confirmados + desestimados + 2),
 * con dos decimales como la columna. Sin historial da 50; cada reporte confirmado la acerca a 100 y cada
 * desestimado a 0, y el +1 y el +2 evitan que un solo reporte la lleve a un extremo.
 */
export function calcularReputacion(confirmados: number, desestimados: number) {
  return Math.round((10_000 * (confirmados + 1)) / (confirmados + desestimados + 2)) / 100;
}
