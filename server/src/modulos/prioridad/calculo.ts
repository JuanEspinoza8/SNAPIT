import type { Severidad, TipoFactor, TipoPuntoInteres } from '@prisma/client';
import { NOMBRE_GENERICO } from '../red/puntosInteres.js';

/** Parámetros prioridad.* (parametro_sistema). Los valores están explicados en docs/calculos.md. */
export interface ParametrosPrioridad {
  pesoSeveridad: number;
  pesoEvidencias: number;
  topeEvidencias: number;
  pesoAntiguedad: number;
  topeAntiguedadDias: number;
  pesoContexto: number;
  radioContextoM: number;
  factorEscuela: number;
  factorCentroSalud: number;
  factorParada: number;
  factorEdificioPublico: number;
}

/** Un punto de interés cerca del incidente. */
export interface PuntoCercano {
  tipo: TipoPuntoInteres;
  nombre: string;
  distanciaM: number;
}

/** Lo que se sabe del incidente para ordenarlo. */
export interface DatosPrioridad {
  severidad: Severidad;
  categoria: { nombre: string; pesoSeveridadBase: number };
  /** Reportes no desestimados, propios y de los incidentes unidos (incidente.cantidad_reportes). */
  cantidadReportes: number;
  /** Vecinos distintos que confirmaron el incidente o alguno de los unidos. */
  confirmaciones: number;
  primerReporteEn: Date;
  /** Los puntos de interés a menos de radio_contexto_m; alcanza con el más cercano de cada tipo. */
  puntosCercanos: PuntoCercano[];
  /** La prioridad que fijó un operador a mano (#62), o null si no hay. */
  ajusteManual: { valor: number; motivo: string; autor: string | null } | null;
}

export interface Factor {
  factor: TipoFactor;
  valor: number;
  /** Por qué sumó, para que el operador lo entienda sin conocer la fórmula. */
  detalle: string;
}

export interface ResultadoPrioridad {
  /** La prioridad calculada, sin el ajuste manual: es la que se guarda en puntaje_prioridad. */
  puntaje: number;
  factores: Factor[];
}

const DIA_MS = 24 * 60 * 60 * 1000;
/** puntaje_prioridad y factor_prioridad.valor son numeric(6,2). */
export const MAXIMO_COLUMNA = 9999.99;

const NIVEL_SEVERIDAD: Record<Severidad, number> = { LEVE: 1, MODERADA: 2, GRAVE: 3 };

const TIPO_PUNTO: Record<TipoPuntoInteres, { nombre: string; conArticulo: string }> = {
  ESCUELA: { nombre: 'escuela', conArticulo: 'una escuela' },
  CENTRO_SALUD: { nombre: 'centro de salud', conArticulo: 'un centro de salud' },
  PARADA_TRANSPORTE: { nombre: 'parada de colectivo', conArticulo: 'una parada de colectivo' },
  EDIFICIO_PUBLICO: { nombre: 'edificio público', conArticulo: 'un edificio público' },
};

function factorDelTipo(tipo: TipoPuntoInteres, p: ParametrosPrioridad) {
  const factores: Record<TipoPuntoInteres, number> = {
    ESCUELA: p.factorEscuela,
    CENTRO_SALUD: p.factorCentroSalud,
    PARADA_TRANSPORTE: p.factorParada,
    EDIFICIO_PUBLICO: p.factorEdificioPublico,
  };
  return factores[tipo];
}

const redondear = (valor: number) => Number(valor.toFixed(2));
const recortar = (valor: number, minimo: number) =>
  redondear(Math.min(MAXIMO_COLUMNA, Math.max(minimo, valor)));

const unDecimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const dosDecimales = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** "+16,2" o "−5,3", con coma decimal. */
function conSigno(valor: number) {
  const texto = unDecimal.format(Math.abs(valor));
  return valor < 0 && texto !== '0' ? `−${texto}` : `+${texto}`;
}

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

function severidad(datos: DatosPrioridad, p: ParametrosPrioridad): Factor {
  const { nombre, pesoSeveridadBase } = datos.categoria;
  const valor = recortar(
    (p.pesoSeveridad * NIVEL_SEVERIDAD[datos.severidad] * pesoSeveridadBase) / 3,
    -MAXIMO_COLUMNA,
  );
  const gravedad = datos.severidad.toLowerCase();
  return {
    factor: 'SEVERIDAD',
    valor,
    detalle: `Gravedad ${gravedad} en ${nombre}, una categoría que pesa ×${dosDecimales.format(pesoSeveridadBase)}: ${conSigno(valor)}`,
  };
}

// Crece rápido con los primeros vecinos y cada vez menos: el quinto aporta más que el decimoquinto.
function evidencias(datos: DatosPrioridad, p: ParametrosPrioridad): Factor {
  const { cantidadReportes: reportes, confirmaciones } = datos;
  const n = reportes + confirmaciones;
  const proporcion = n <= 0 ? 0 : Math.min(1, Math.log(1 + n) / Math.log(1 + p.topeEvidencias));
  const valor = recortar(p.pesoEvidencias * proporcion, -MAXIMO_COLUMNA);

  const partes: string[] = [];
  if (reportes > 0) partes.push(`lo reportaron ${reportes} ${reportes === 1 ? 'vez' : 'veces'}`);
  if (confirmaciones > 0) {
    partes.push(confirmaciones === 1 ? 'lo confirmó 1 vecino' : `lo confirmaron ${confirmaciones} vecinos`);
  }
  let texto = partes.length > 0 ? conMayuscula(partes.join(' y ')) : 'Sin reportes válidos ni confirmaciones';
  if (n >= p.topeEvidencias) texto += ` (con ${unDecimal.format(p.topeEvidencias)} o más ya suma el máximo)`;
  return { factor: 'EVIDENCIAS', valor, detalle: `${texto}: ${conSigno(valor)}` };
}

// En días completos: el número del texto coincide con la cuenta, y el valor cambia una vez por día.
function antiguedad(datos: DatosPrioridad, p: ParametrosPrioridad, ahora: Date): Factor {
  // Un primer reporte con la hora un poco adelantada no da días negativos.
  const dias = Math.max(0, Math.floor((ahora.getTime() - datos.primerReporteEn.getTime()) / DIA_MS));
  const valor = recortar(p.pesoAntiguedad * Math.min(1, dias / p.topeAntiguedadDias), -MAXIMO_COLUMNA);

  let texto =
    dias === 0
      ? 'Lleva menos de un día sin resolverse'
      : `Lleva ${dias} ${dias === 1 ? 'día' : 'días'} sin resolverse`;
  if (dias >= p.topeAntiguedadDias) {
    texto += ` (con ${unDecimal.format(p.topeAntiguedadDias)} o más ya suma el máximo)`;
  }
  return { factor: 'ANTIGUEDAD', valor, detalle: `${texto}: ${conSigno(valor)}` };
}

/** El punto que más suma; ante un empate, el más cercano. Null si no hay ninguno dentro del radio. */
function puntoMasRelevante(puntos: PuntoCercano[], p: ParametrosPrioridad) {
  let elegido: PuntoCercano | null = null;
  for (const punto of puntos) {
    if (punto.distanciaM > p.radioContextoM) continue;
    const factor = factorDelTipo(punto.tipo, p);
    const factorElegido = elegido ? factorDelTipo(elegido.tipo, p) : -1;
    if (
      !elegido ||
      factor > factorElegido ||
      (factor === factorElegido && punto.distanciaM < elegido.distanciaM)
    ) {
      elegido = punto;
    }
  }
  return elegido;
}

// Cuenta solo el punto más relevante, no la suma: diez paradas juntas no valen más que una escuela.
function contextoUrbano(datos: DatosPrioridad, p: ParametrosPrioridad): Factor {
  const punto = puntoMasRelevante(datos.puntosCercanos, p);
  if (!punto) {
    return {
      factor: 'CONTEXTO_URBANO',
      valor: 0,
      detalle: `Sin escuelas, centros de salud, paradas ni edificios públicos a menos de ${unDecimal.format(p.radioContextoM)} m: +0`,
    };
  }

  const valor = recortar(p.pesoContexto * factorDelTipo(punto.tipo, p), -MAXIMO_COLUMNA);
  const tipo = TIPO_PUNTO[punto.tipo];
  // Un lugar sin nombre en OSM se guardó con el de su tipo («Escuela»). Muchas paradas se llaman con su
  // código («N-2935»): por eso el tipo va siempre aparte.
  const lugar =
    punto.nombre === NOMBRE_GENERICO[punto.tipo] ? tipo.conArticulo : `${punto.nombre} (${tipo.nombre})`;
  return {
    factor: 'CONTEXTO_URBANO',
    valor,
    detalle: `A ${Math.round(punto.distanciaM)} m de ${lugar}: ${conSigno(valor)}`,
  };
}

/**
 * Prioridad de atención de un incidente (F07): la suma de cuatro factores, cada uno con su explicación.
 *
 *   severidad   = peso_severidad × (nivel / 3) × peso de la categoría   (LEVE 1, MODERADA 2, GRAVE 3)
 *   evidencias  = peso_evidencias × min(1, ln(1 + n) / ln(1 + tope_evidencias)),  n = reportes + confirmaciones
 *   antigüedad  = peso_antiguedad × min(1, días / tope_antiguedad_dias)
 *   contexto    = peso_contexto × factor del punto de interés más relevante a ≤ radio_contexto_m
 *
 * Si un operador fijó la prioridad a mano, se agrega AJUSTE_MANUAL con la diferencia entre su valor y el
 * calculado, pero el puntaje sigue siendo el calculado: la bandeja usa coalesce(prioridad_manual, puntaje).
 * Cada factor y el puntaje se recortan al máximo de su columna (9999,99).
 */
export function calcularPrioridad(
  datos: DatosPrioridad,
  parametros: ParametrosPrioridad,
  ahora: Date,
): ResultadoPrioridad {
  const factores = [
    severidad(datos, parametros),
    evidencias(datos, parametros),
    antiguedad(datos, parametros, ahora),
    contextoUrbano(datos, parametros),
  ];
  const puntaje = recortar(
    factores.reduce((total, factor) => total + factor.valor, 0),
    0,
  );

  const ajuste = datos.ajusteManual;
  if (ajuste) {
    const valor = recortar(ajuste.valor - puntaje, -MAXIMO_COLUMNA);
    const quien = ajuste.autor ? ` de ${ajuste.autor}` : '';
    factores.push({
      factor: 'AJUSTE_MANUAL',
      valor,
      detalle: `Ajuste manual${quien} (${ajuste.motivo}): ${conSigno(valor)}`,
    });
  }

  return { puntaje, factores };
}
