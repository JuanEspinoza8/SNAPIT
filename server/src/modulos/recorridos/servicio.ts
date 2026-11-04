import { ErrorApp } from '../../compartido/errores.js';
import { costoDelTramo, minutosCaminando } from './calculo.js';
import type { ConsultaRecorrido } from './esquemas.js';
import * as repositorio from './repositorio.js';

/** Cuáles de los dos puntos tienen el problema. */
function campos(origen: boolean, destino: boolean) {
  return [...(origen ? ['origen'] : []), ...(destino ? ['destino'] : [])];
}

/**
 * El recorrido peatonal más conveniente entre dos puntos de la zona piloto para un perfil de movilidad (F11):
 * evita los tramos intransitables para ese perfil y encarece los que le cuestan más (docs/calculos.md).
 */
export async function calcularRecorrido({ origen, destino, perfilId }: ConsultaRecorrido) {
  if (!(await repositorio.perfilActivo(perfilId))) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: 'perfilId', mensaje: 'No hay un perfil de movilidad activo con ese id' },
    ]);
  }

  const enZona = await repositorio.dentroDeZona(origen, destino);
  if (!enZona.origen || !enZona.destino) {
    const afuera = campos(!enZona.origen, !enZona.destino);
    const quien = afuera.length === 2 ? 'El origen y el destino quedan' : `El ${afuera[0]} queda`;
    throw new ErrorApp(
      422,
      'FUERA_DE_ZONA',
      `${quien} fuera de la zona piloto: por ahora los recorridos se calculan solo dentro de ella`,
      afuera.map((campo) => ({ campo, mensaje: 'Está fuera de la zona piloto' })),
    );
  }

  const parametros = await repositorio.leerParametros();
  const [nodoOrigen, nodoDestino] = await Promise.all([
    repositorio.nodoCercano(origen, parametros.distanciaMaxAlNodoM),
    repositorio.nodoCercano(destino, parametros.distanciaMaxAlNodoM),
  ]);
  if (nodoOrigen === null || nodoDestino === null) {
    const lejos = campos(nodoOrigen === null, nodoDestino === null);
    throw new ErrorApp(
      422,
      'SIN_RED_CERCA',
      `No hay ninguna vereda a menos de ${parametros.distanciaMaxAlNodoM} m del ${lejos.join(' ni del ')}: elegí un punto más cerca de una calle`,
      lejos.map((campo) => ({ campo, mensaje: 'No hay ninguna vereda cerca' })),
    );
  }
  if (nodoOrigen === nodoDestino) {
    throw new ErrorApp(
      422,
      'MISMO_PUNTO',
      'El origen y el destino quedan en la misma esquina: no hace falta un recorrido',
    );
  }

  const [reglas, tramos] = await Promise.all([
    repositorio.leerReglasPerfil(perfilId),
    repositorio.tramosDelPerfil(perfilId),
  ]);
  const costos = tramos.map((tramo) => ({ ...tramo, costo: costoDelTramo(tramo, reglas, parametros) }));
  const camino = await repositorio.caminoMasBarato(costos, nodoOrigen, nodoDestino);
  if (!camino) throw new ErrorApp(422, 'SIN_RECORRIDO', 'No hay un recorrido transitable');

  // El tiempo sale de los metros que se muestran: 200,1 m no tienen que dar un minuto más que 200 m.
  const distanciaMetros = Math.round(camino.distanciaMetros);
  return {
    distanciaMetros,
    minutosEstimados: minutosCaminando(distanciaMetros, parametros.velocidadMPorMin),
    geometria: camino.geometria,
  };
}
