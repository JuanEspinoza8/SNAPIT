import type { EstadoIncidente, Severidad } from '@prisma/client';

/** Parámetros de agrupacion.* (parametro_sistema). Los valores están explicados en docs/calculos.md. */
export interface ParametrosAgrupacion {
  radioM: number;
  ventanaDias: number;
  pesoDistancia: number;
  pesoTiempo: number;
  pesoFoto: number;
  umbral: number;
  /** Con menos unos, el hash de la foto no sirve para compararla (una foto lisa u oscura): no suma parecido. */
  unosMinimosHash: number;
}

/** El reporte que acaba de llegar. */
export interface ReporteNuevo {
  categoriaId: number;
}

/** Un incidente cercano, con lo que hace falta para puntuarlo. */
export interface Candidato {
  incidenteId: number;
  categoriaId: number;
  estado: EstadoIncidente;
  /** Si un operador lo unió a otro incidente. */
  incidentePrincipalId: number | null;
  caducadoEn: Date | null;
  vigenteHasta: Date | null;
  /** Distancia en metros al punto del reporte nuevo. */
  distanciaM: number;
  /**
   * Cuándo llegó al servidor el reporte más reciente del incidente (sin contar desestimados, y sumando
   * los de los incidentes que se le unieron). Null si no le queda ninguno válido.
   */
  ultimoReporteEn: Date | null;
  /**
   * Bits distintos entre la foto nueva y la más parecida del incidente. Null si falta algún hash o si
   * tiene menos de `unosMinimosHash` unos.
   */
  hamming: number | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;
// Con 32 bits distintos (la mitad de 64), dos fotos ya no se parecen más que dos fotos al azar.
const BITS_SIN_PARECIDO = 32;
const ESTADOS_CERRADOS: EstadoIncidente[] = ['RESUELTO', 'DESESTIMADO'];

/** Parecido entre fotos de 0 (nada) a 1 (la misma): max(0, 1 − hamming/32). Sin hash, 0. */
export function similitudFoto(hamming: number | null) {
  if (hamming === null) return 0;
  return Math.max(0, 1 - hamming / BITS_SIN_PARECIDO);
}

/**
 * Qué tan probable es que el reporte nuevo hable del mismo problema que el candidato, de 0 a 1:
 *
 *   puntaje = peso_distancia·(1 − d/radio) + peso_tiempo·(1 − Δt/ventana) + peso_foto·similitud
 *
 * Δt son los días entre la llegada del reporte nuevo (`ahora`) y la del último reporte del incidente. Se
 * mide con la llegada al servidor y no con registradoEn, que lo manda el celular: una fecha vieja no
 * puede revivir un incidente que quedó fuera de la ventana.
 *
 * Devuelve null si el candidato no puede recibir reportes: otra categoría, cerrado (resuelto o
 * desestimado), caducado o vencido, unido a otro incidente, más lejos que el radio, sin reportes
 * válidos o con su último reporte fuera de la ventana de tiempo.
 */
export function puntajeAgrupacion(
  reporte: ReporteNuevo,
  candidato: Candidato,
  parametros: ParametrosAgrupacion,
  ahora: Date,
): number | null {
  if (candidato.categoriaId !== reporte.categoriaId) return null;
  if (ESTADOS_CERRADOS.includes(candidato.estado)) return null;
  if (candidato.incidentePrincipalId !== null) return null;
  if (candidato.caducadoEn !== null) return null;
  if (candidato.vigenteHasta !== null && candidato.vigenteHasta <= ahora) return null;
  if (candidato.distanciaM > parametros.radioM) return null;
  if (candidato.ultimoReporteEn === null) return null;

  // En valor absoluto: un último reporte con fecha posterior a `ahora` no da un Δt negativo que sume de más.
  const diasEntre = Math.abs(ahora.getTime() - candidato.ultimoReporteEn.getTime()) / DIA_MS;
  if (diasEntre > parametros.ventanaDias) return null;

  return (
    parametros.pesoDistancia * (1 - candidato.distanciaM / parametros.radioM) +
    parametros.pesoTiempo * (1 - diasEntre / parametros.ventanaDias) +
    parametros.pesoFoto * similitudFoto(candidato.hamming)
  );
}

/**
 * El incidente al que se suma el reporte: el de mayor puntaje, si supera el umbral (§7.2 del plan y la
 * #53). Null si ninguno lo supera (se crea un incidente nuevo). Ante un empate, el más cercano.
 */
export function elegirIncidente(
  reporte: ReporteNuevo,
  candidatos: Candidato[],
  parametros: ParametrosAgrupacion,
  ahora: Date,
): { incidenteId: number; puntaje: number } | null {
  let mejor: { incidenteId: number; puntaje: number; distanciaM: number } | null = null;
  for (const candidato of candidatos) {
    const puntaje = puntajeAgrupacion(reporte, candidato, parametros, ahora);
    if (puntaje === null || puntaje <= parametros.umbral) continue;
    if (
      !mejor ||
      puntaje > mejor.puntaje ||
      (puntaje === mejor.puntaje && candidato.distanciaM < mejor.distanciaM)
    ) {
      mejor = { incidenteId: candidato.incidenteId, puntaje, distanciaM: candidato.distanciaM };
    }
  }
  return mejor && { incidenteId: mejor.incidenteId, puntaje: mejor.puntaje };
}

const ORDEN_SEVERIDAD: Severidad[] = ['LEVE', 'MODERADA', 'GRAVE'];

/**
 * La severidad del incidente: la que más declararon los vecinos (sin contar reportes desestimados).
 * Ante un empate, la más alta: es más seguro sobreestimar un riesgo que ignorarlo.
 */
export function severidadConsolidada(declaradas: Severidad[]): Severidad {
  if (declaradas.length === 0) throw new Error('Hace falta al menos una severidad');
  const cuantas = new Map<Severidad, number>();
  for (const severidad of declaradas) cuantas.set(severidad, (cuantas.get(severidad) ?? 0) + 1);
  let elegida = declaradas[0]!;
  for (const [severidad, veces] of cuantas) {
    const vecesElegida = cuantas.get(elegida)!;
    if (
      veces > vecesElegida ||
      (veces === vecesElegida && ORDEN_SEVERIDAD.indexOf(severidad) > ORDEN_SEVERIDAD.indexOf(elegida))
    ) {
      elegida = severidad;
    }
  }
  return elegida;
}
