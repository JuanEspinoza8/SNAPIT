import {
  type DefinicionParametros,
  leerParametrosNumericos,
  noNegativo,
} from '../../compartido/parametros.js';
import type { ParametrosCierre } from './calculo.js';

// El mismo valor que carga la semilla: si falta el parámetro, se decide con este.
const PARAMETROS: DefinicionParametros<keyof ParametrosCierre> = {
  distanciaMaxM: { clave: 'cierre.distancia_max_m', valor: 50, valido: noNegativo },
};

/** Los parámetros cierre.* de parametro_sistema. */
export function leerParametros(): Promise<ParametrosCierre> {
  return leerParametrosNumericos(PARAMETROS);
}
