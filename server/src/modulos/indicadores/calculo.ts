/** Los estados de un incidente abierto, en el orden del circuito (F13). */
export const ESTADOS_ABIERTOS = ['REGISTRADO', 'VERIFICADO', 'DERIVADO', 'EN_EJECUCION'] as const;
export type EstadoAbierto = (typeof ESTADOS_ABIERTOS)[number];

/** Un incidente resuelto en el período: de dónde es y cuántos días pasaron del primer reporte a la resolución. */
export interface Resuelto {
  categoriaId: number;
  categoriaNombre: string;
  areaId: number;
  areaNombre: string;
  /** Null si todavía no tiene dirección: no entra en ningún barrio. */
  barrio: string | null;
  dias: number;
}

export interface Tiempos {
  cantidad: number;
  medianaDias: number;
  promedioDias: number;
}

const ordenCastellano = new Intl.Collator('es');
const unDecimal = (valor: number) => Number(valor.toFixed(1));

/** Las cuatro filas siempre, en el orden del circuito: un estado sin incidentes va en 0. */
export function abiertosPorEstado(filas: { estado: string; cantidad: number }[]) {
  return ESTADOS_ABIERTOS.map((estado) => ({
    estado,
    cantidad: filas.find((fila) => fila.estado === estado)?.cantidad ?? 0,
  }));
}

// Con al menos un valor. Con cantidad par, el promedio de los dos del medio.
function mediana(valores: number[]) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1 ? ordenados[medio]! : (ordenados[medio - 1]! + ordenados[medio]!) / 2;
}

function resumir(dias: number[]): Tiempos {
  const suma = dias.reduce((total, valor) => total + valor, 0);
  return {
    cantidad: dias.length,
    medianaDias: unDecimal(mediana(dias)),
    promedioDias: unDecimal(suma / dias.length),
  };
}

/**
 * Agrupa los resueltos con `claveDe` y resume cada grupo. Los que no tienen clave (null) no entran. Primero el
 * grupo que más tarda (mediana mayor); ante un empate, por nombre.
 */
function resumirPor<C extends string | number>(
  resueltos: Resuelto[],
  claveDe: (resuelto: Resuelto) => C | null,
  nombreDe: (resuelto: Resuelto) => string,
) {
  const grupos = new Map<C, { nombre: string; dias: number[] }>();
  for (const resuelto of resueltos) {
    const clave = claveDe(resuelto);
    if (clave === null) continue;
    const grupo = grupos.get(clave) ?? { nombre: nombreDe(resuelto), dias: [] };
    grupo.dias.push(resuelto.dias);
    grupos.set(clave, grupo);
  }
  return [...grupos]
    .map(([clave, grupo]) => ({ clave, nombre: grupo.nombre, ...resumir(grupo.dias) }))
    .sort((a, b) => b.medianaDias - a.medianaDias || ordenCastellano.compare(a.nombre, b.nombre));
}

/** Mediana y promedio de los días que tardó en resolverse cada incidente, por categoría, por área y por barrio. */
export function tiemposDeResolucion(resueltos: Resuelto[]) {
  const porCategoria = resumirPor(
    resueltos,
    (r) => r.categoriaId,
    (r) => r.categoriaNombre,
  );
  const porArea = resumirPor(
    resueltos,
    (r) => r.areaId,
    (r) => r.areaNombre,
  );
  const porBarrio = resumirPor(
    resueltos,
    (r) => r.barrio,
    (r) => r.barrio ?? '',
  );
  return {
    porCategoria: porCategoria.map(({ clave, ...grupo }) => ({ id: clave, ...grupo })),
    porArea: porArea.map(({ clave, ...grupo }) => ({ id: clave, ...grupo })),
    porBarrio: porBarrio.map(({ nombre, cantidad, medianaDias, promedioDias }) => ({
      barrio: nombre,
      cantidad,
      medianaDias,
      promedioDias,
    })),
  };
}

/** Del barrio con más incidentes abiertos al que tiene menos; ante un empate, por nombre. */
export function ordenarBarrios(barrios: { barrio: string; cantidad: number }[]) {
  return [...barrios].sort((a, b) => b.cantidad - a.cantidad || ordenCastellano.compare(a.barrio, b.barrio));
}

/** `parte` sobre `total`, en porcentaje con un decimal. Null si no hay total: no hay nada que dividir. */
export function porcentaje(parte: number, total: number) {
  return total === 0 ? null : unDecimal((parte / total) * 100);
}

/**
 * El peso de cada punto del mapa de calor, entre 0 y 1: su prioridad sobre la mayor del conjunto. No se divide
 * por 100 porque la prioridad puede pasarlo (por el peso de la categoría o una manual). Si todas son 0, todos
 * pesan lo mismo.
 */
export function pesosDeCalor(prioridades: number[]) {
  const mayor = prioridades.reduce((maximo, prioridad) => Math.max(maximo, prioridad), 0);
  if (mayor === 0) return prioridades.map(() => 1);
  return prioridades.map((prioridad) => Number((Math.max(0, prioridad) / mayor).toFixed(2)));
}
