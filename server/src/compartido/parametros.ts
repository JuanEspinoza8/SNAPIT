import type { Prisma } from '@prisma/client';
import { logger } from '../config/logger.js';
import { prisma } from './prisma.js';

/** Qué valores tienen sentido para un parámetro. Sin regla, cualquier número sirve. */
type Regla = (valor: number) => boolean;

export const positivo: Regla = (valor) => valor > 0;
export const noNegativo: Regla = (valor) => valor >= 0;
export const deCeroACien: Regla = (valor) => valor >= 0 && valor <= 100;
/** Una cantidad de bits del hash perceptual (64). */
export const bitsDelHash: Regla = (valor) => Number.isInteger(valor) && valor >= 0 && valor <= 64;

/**
 * Para cada nombre: su clave en parametro_sistema, el valor de partida (el mismo que carga la semilla) y,
 * si hace falta, qué valores tienen sentido.
 */
export type DefinicionParametros<T extends string> = Record<
  T,
  { clave: string; valor: number; valido?: Regla }
>;

/**
 * Lee de parametro_sistema los valores numéricos de un cálculo. Si uno falta o no cumple su regla, se usa su
 * valor de partida y se avisa en el log: antes que frenar un reporte, se calcula con lo conocido.
 *
 * Dentro de una transacción hay que pasarle `tx`: con el cliente global pediría otra conexión mientras la
 * transacción retiene la suya.
 */
export async function leerParametrosNumericos<T extends string>(
  definicion: DefinicionParametros<T>,
  cliente: Prisma.TransactionClient = prisma,
): Promise<Record<T, number>> {
  const entradas = Object.entries(definicion) as [T, DefinicionParametros<T>[T]][];
  const filas = await cliente.parametroSistema.findMany({
    where: { clave: { in: entradas.map(([, parametro]) => parametro.clave) } },
  });
  const leidos = new Map(filas.map((fila) => [fila.clave, Number(fila.valor)]));

  const parametros = {} as Record<T, number>;
  for (const [nombre, { clave, valor, valido }] of entradas) {
    const leido = leidos.get(clave);
    const usable = leido !== undefined && Number.isFinite(leido) && (!valido || valido(leido));
    if (!usable) logger.warn('Falta o no es válido el parámetro %s: se usa %d', clave, valor);
    parametros[nombre] = usable ? leido : valor;
  }
  return parametros;
}
