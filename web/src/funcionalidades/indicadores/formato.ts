import type { Indicadores } from './tipos.js';

const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/** «4,5». */
export const decimal = (valor: number) => numero.format(valor);

/** «1 día», «4,5 días». */
export const dias = (valor: number) => `${decimal(valor)} ${valor === 1 ? 'día' : 'días'}`;

/** La semana por su lunes: «2026-10-19» → «19/10». */
export const semanaCorta = (lunes: string) => lunes.slice(5).split('-').reverse().join('/');

/** Las cuentas de las tarjetas de arriba, sacadas de los mismos indicadores que los gráficos. */
export function resumen(indicadores: Indicadores) {
  const suma = (valores: number[]) => valores.reduce((total, valor) => total + valor, 0);
  return {
    abiertos: suma(indicadores.abiertosPorEstado.map((fila) => fila.cantidad)),
    nuevos: suma(indicadores.nuevosYResueltosPorSemana.map((fila) => fila.nuevos)),
    resueltos: suma(indicadores.nuevosYResueltosPorSemana.map((fila) => fila.resueltos)),
    desestimados: indicadores.reportesDesestimados,
  };
}

/** Sin nada en el período no hay qué graficar: el panel lo dice en lugar de mostrar gráficos vacíos. */
export function sinDatos(indicadores: Indicadores) {
  const { abiertos, nuevos, resueltos, desestimados } = resumen(indicadores);
  return abiertos === 0 && nuevos === 0 && resueltos === 0 && desestimados.total === 0;
}
