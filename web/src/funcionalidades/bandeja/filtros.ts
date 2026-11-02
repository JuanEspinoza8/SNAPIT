import type { EstadoBandeja, FiltrosBandeja } from './tipos.js';

export const ESTADOS_BANDEJA: EstadoBandeja[] = ['VERIFICADO', 'DERIVADO', 'EN_EJECUCION'];

// Los id son int en la base: uno más grande el servidor lo rechaza.
const MAXIMO_ID = 2_147_483_647;

function leerId(texto: string | null) {
  if (!texto || !/^\d+$/.test(texto)) return undefined;
  const id = Number(texto);
  return id > 0 && id <= MAXIMO_ID ? id : undefined;
}

/**
 * Los filtros que vienen en la URL de la bandeja. Lo que no es válido se descarta: un link mal copiado
 * muestra la bandeja sin ese filtro en lugar de un error.
 */
export function leerFiltros(parametros: URLSearchParams): FiltrosBandeja {
  const filtros: FiltrosBandeja = {};
  const area = parametros.get('areaId');
  const areaId = area === 'todas' ? 'todas' : leerId(area);
  if (areaId !== undefined) filtros.areaId = areaId;
  const estado = parametros.get('estado') as EstadoBandeja | null;
  if (estado && ESTADOS_BANDEJA.includes(estado)) filtros.estado = estado;
  const categoriaId = leerId(parametros.get('categoriaId'));
  if (categoriaId !== undefined) filtros.categoriaId = categoriaId;
  return filtros;
}

/** Los filtros como parámetros, con los mismos nombres en la URL de la web y en GET /api/bandeja. */
export function aParametros(filtros: FiltrosBandeja): URLSearchParams {
  const parametros = new URLSearchParams();
  if (filtros.areaId !== undefined) parametros.set('areaId', String(filtros.areaId));
  if (filtros.estado) parametros.set('estado', filtros.estado);
  if (filtros.categoriaId !== undefined) parametros.set('categoriaId', String(filtros.categoriaId));
  return parametros;
}
