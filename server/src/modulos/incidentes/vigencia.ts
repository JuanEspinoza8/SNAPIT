import type { Categoria, Prisma } from '@prisma/client';
import { type DefinicionParametros, leerParametrosNumericos } from '../../compartido/parametros.js';
import { prisma } from '../../compartido/prisma.js';
import { type Vigencia, vigenciaSegunCategoria } from './calculo.js';

// El mismo valor que carga la semilla: si falta el parámetro, antes que rechazar el reporte se usa este.
const PARAMETROS: DefinicionParametros<'diasPorDefecto'> = {
  diasPorDefecto: {
    clave: 'vigencia.dias_default',
    valor: 30,
    valido: (dias) => Number.isInteger(dias) && dias > 0,
  },
};

/**
 * La vigencia de la categoría contada desde `desde`, con vigencia.dias_default para un temporal que no define
 * sus días. La usan el alta y la separación de un reporte y el cambio de categoría. Dentro de una transacción
 * hay que pasarle `tx`.
 */
export async function vigenciaDeCategoria(
  categoria: Pick<Categoria, 'tipoVigenciaDefault' | 'diasCaducidadDefault'>,
  desde: Date,
  cliente: Prisma.TransactionClient = prisma,
): Promise<Vigencia> {
  const { diasPorDefecto } = await leerParametrosNumericos(PARAMETROS, cliente);
  return vigenciaSegunCategoria(categoria, desde, diasPorDefecto);
}
