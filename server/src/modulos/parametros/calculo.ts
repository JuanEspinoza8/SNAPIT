import { reglaDe } from '../../compartido/parametros.js';
import { leerEfecto } from '../recorridos/calculo.js';

const ENTERO = /^-?\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Qué tiene de malo el valor que quiere guardar el administrador, o null si está bien (#167). Primero su tipo
 * (`entero`, `decimal` o `factor`: un número mayor que 0 o «intransitable»); después, la regla que declara para
 * esa clave el cálculo que la usa, la misma con la que la lee.
 */
export function problemaDelValor(clave: string, tipo: string, valor: string): string | null {
  const texto = valor.trim();
  if (tipo === 'factor') {
    return leerEfecto(texto) === null ? 'Tiene que ser un número mayor que 0 o «intransitable»' : null;
  }
  if (tipo === 'entero' && !ENTERO.test(texto)) return 'Tiene que ser un número entero';
  if (tipo === 'decimal' && !DECIMAL.test(texto))
    return 'Tiene que ser un número, con punto para los decimales';
  if (tipo !== 'entero' && tipo !== 'decimal') return `Un parámetro de tipo «${tipo}» no se edita desde acá`;

  const { valido, mensaje } = reglaDe(clave);
  return valido && !valido(Number(texto)) ? mensaje! : null;
}
