import type { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from './prisma.js';

/** Qué valores tienen sentido para un parámetro. Sin regla, cualquier número sirve. */
type Regla = (valor: number) => boolean;

export const positivo: Regla = (valor) => valor > 0;
export const noNegativo: Regla = (valor) => valor >= 0;
export const deCeroACien: Regla = (valor) => valor >= 0 && valor <= 100;
/** Una cantidad de bits del hash perceptual (64). */
export const bitsDelHash: Regla = (valor) => Number.isInteger(valor) && valor >= 0 && valor <= 64;
/** Una cantidad de días, de veces o de algo que se cuenta: entera y mayor que 0. */
export const enteroPositivo: Regla = (valor) => Number.isInteger(valor) && valor > 0;

// Lo que se le dice al administrador cuando un valor no cumple la regla (#167).
const MENSAJES = new Map<Regla, string>([
  [positivo, 'Tiene que ser mayor que 0'],
  [noNegativo, 'No puede ser negativo'],
  [deCeroACien, 'Tiene que estar entre 0 y 100'],
  [bitsDelHash, 'Tiene que ser un entero de 0 a 64'],
  [enteroPositivo, 'Tiene que ser un entero mayor que 0'],
]);

/**
 * Para cada nombre: su clave en parametro_sistema, el valor de partida (el mismo que carga la semilla) y,
 * si hace falta, qué valores tienen sentido.
 */
export type DefinicionParametros<T extends string> = Record<
  T,
  { clave: string; valor: number; valido?: Regla }
>;

// Las reglas de cada clave, tal como las declara cada cálculo. Con esto la administración valida un valor antes
// de guardarlo con la misma regla que usa el cálculo al leerlo.
const registradas = new Map<string, Regla | undefined>();

/**
 * Declara los parámetros de un cálculo y registra la regla de cada clave, para que la administración la use al
 * validar (`PUT /api/admin/parametros`). Cada módulo la llama al cargarse, con su definición.
 */
export function definirParametros<T extends string>(definicion: DefinicionParametros<T>) {
  for (const { clave, valido } of Object.values<DefinicionParametros<T>[T]>(definicion)) {
    registradas.set(clave, valido);
  }
  return definicion;
}

/** Si la clave la declara algún cálculo, y con qué regla. */
export function reglaDe(clave: string): { declarada: boolean; valido?: Regla; mensaje?: string } {
  if (!registradas.has(clave)) return { declarada: false };
  const valido = registradas.get(clave);
  if (!valido) return { declarada: true };
  return {
    declarada: true,
    valido,
    mensaje: MENSAJES.get(valido) ?? 'No es un valor válido para este parámetro',
  };
}

/** Las claves que declara algún cálculo. */
export const clavesDeclaradas = () => [...registradas.keys()];

type Cliente = Prisma.TransactionClient;

/**
 * Una copia de parametro_sistema que dura `vidaMs` (§7 de la arquitectura): cada cálculo lee de acá en lugar de
 * ir a la base. Guardar un parámetro la invalida. Una lectura que empezó antes de invalidar no queda guardada:
 * podría traer el valor anterior. Con `vidaMs` 0 no guarda nada (así corren los tests, que cambian la base).
 */
export function crearCacheParametros({ vidaMs, ahora = Date.now }: { vidaMs: number; ahora?: () => number }) {
  let tabla: Map<string, string> | null = null;
  let leidaEn = 0;
  let generacion = 0;

  return {
    async leer(cliente: Cliente): Promise<Map<string, string>> {
      if (tabla && ahora() - leidaEn < vidaMs) return tabla;
      const desde = generacion;
      const filas = await cliente.parametroSistema.findMany({ select: { clave: true, valor: true } });
      const leida = new Map(filas.map((fila) => [fila.clave, fila.valor]));
      if (vidaMs > 0 && desde === generacion) {
        tabla = leida;
        leidaEn = ahora();
      }
      return leida;
    },
    invalidar() {
      generacion++;
      tabla = null;
    },
  };
}

const cache = crearCacheParametros({ vidaMs: env.PARAMETROS_CACHE_MS });

/**
 * Todos los parámetros, clave → valor, de la caché. Dentro de una transacción hay que pasarle `tx`: con el cliente
 * global pediría otra conexión mientras la transacción retiene la suya.
 */
export const leerTablaParametros = (cliente: Cliente = prisma) => cache.leer(cliente);

/** Que el próximo cálculo vuelva a leer la base. Se llama después de confirmar el cambio, no antes. */
export const invalidarParametros = () => cache.invalidar();

/**
 * Lee los valores numéricos de un cálculo. Si uno falta o no cumple su regla, se usa su valor de partida y se
 * avisa en el log: antes que frenar un reporte, se calcula con lo conocido.
 */
export async function leerParametrosNumericos<T extends string>(
  definicion: DefinicionParametros<T>,
  cliente: Cliente = prisma,
): Promise<Record<T, number>> {
  const tabla = await leerTablaParametros(cliente);
  const parametros = {} as Record<T, number>;
  for (const [nombre, { clave, valor, valido }] of Object.entries(definicion) as [
    T,
    DefinicionParametros<T>[T],
  ][]) {
    const texto = tabla.get(clave);
    const leido = texto === undefined ? undefined : Number(texto);
    const usable = leido !== undefined && Number.isFinite(leido) && (!valido || valido(leido));
    if (!usable) logger.warn('Falta o no es válido el parámetro %s: se usa %d', clave, valor);
    parametros[nombre] = usable ? leido : valor;
  }
  return parametros;
}
