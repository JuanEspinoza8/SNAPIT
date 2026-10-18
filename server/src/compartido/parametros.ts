import { logger } from '../config/logger.js';
import { prisma } from './prisma.js';

/** Para cada nombre: su clave en parametro_sistema y el valor de partida (el mismo que carga la semilla). */
export type DefinicionParametros<T extends string> = Record<T, { clave: string; valor: number }>;

/**
 * Lee de parametro_sistema los valores numéricos de un cálculo. Si uno falta o no cumple `valido`, se usa su
 * valor de partida y se avisa en el log: antes que frenar un reporte, se calcula con lo conocido.
 */
export async function leerParametrosNumericos<T extends string>(
  definicion: DefinicionParametros<T>,
  valido: (valor: number) => boolean = Number.isFinite,
): Promise<Record<T, number>> {
  const entradas = Object.entries(definicion) as [T, { clave: string; valor: number }][];
  const filas = await prisma.parametroSistema.findMany({
    where: { clave: { in: entradas.map(([, parametro]) => parametro.clave) } },
  });
  const leidos = new Map(filas.map((fila) => [fila.clave, Number(fila.valor)]));

  const parametros = {} as Record<T, number>;
  for (const [nombre, { clave, valor }] of entradas) {
    const leido = leidos.get(clave);
    const usable = leido !== undefined && Number.isFinite(leido) && valido(leido);
    if (!usable) logger.warn('Falta o no es válido el parámetro %s: se usa %d', clave, valor);
    parametros[nombre] = usable ? leido : valor;
  }
  return parametros;
}
