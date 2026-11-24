import type { ClienteApi } from './cliente.js';
import type { FiltrosIndicadores, Indicadores, PuntoCalor } from '../../funcionalidades/indicadores/tipos.js';

/** Los indicadores de gestión del organismo (F13, docs/api.md). */
export interface RepositorioIndicadores {
  indicadores(filtros: FiltrosIndicadores): Promise<Indicadores>;
  calor(filtros: FiltrosIndicadores): Promise<PuntoCalor[]>;
}

/** «?desde=2026-10-01&hasta=2026-10-31&areaId=2». Sin área, todo el organismo. */
function consulta({ desde, hasta, areaId }: FiltrosIndicadores) {
  const parametros = new URLSearchParams({ desde, hasta });
  if (areaId !== null) parametros.set('areaId', String(areaId));
  return `?${parametros.toString()}`;
}

export function crearRepositorioIndicadores(cliente: ClienteApi): RepositorioIndicadores {
  return {
    indicadores(filtros) {
      return cliente.pedir<Indicadores>(`/indicadores${consulta(filtros)}`);
    },
    async calor(filtros) {
      const { puntos } = await cliente.pedir<{ puntos: PuntoCalor[] }>(
        `/indicadores/calor${consulta(filtros)}`,
      );
      return puntos;
    },
  };
}
