import type { ClienteApi } from './cliente.js';
import { conComentario } from './repositorioIncidentes.js';
import { aParametros } from '../../funcionalidades/bandeja/filtros.js';
import type {
  FichaGestion,
  FiltrosBandeja,
  IncidenteBandeja,
  Movimiento,
  Prioridad,
  Referencia,
} from '../../funcionalidades/bandeja/tipos.js';

/** La prioridad que devuelven fijarla y quitarla. No traen el movimiento: la bitácora se vuelve a pedir. */
type RespuestaPrioridad = Prioridad & { id: number };

/** La bandeja del organismo y la gestión de cada incidente (F06, F07 y F08, docs/api.md). */
export interface RepositorioGestion {
  bandeja(filtros: FiltrosBandeja): Promise<IncidenteBandeja[]>;
  ficha(id: number): Promise<FichaGestion>;
  derivar(
    id: number,
    areaId: number,
    comentario: string,
  ): Promise<{ id: number; estado: 'DERIVADO'; area: Referencia; movimiento: Movimiento }>;
  cambiarEstado(
    id: number,
    estado: 'EN_EJECUCION' | 'DESESTIMADO',
    comentario: string,
  ): Promise<{ id: number; estado: 'EN_EJECUCION' | 'DESESTIMADO'; movimiento: Movimiento }>;
  comentar(id: number, comentario: string): Promise<{ id: number; movimiento: Movimiento }>;
  cambiarCategoria(
    id: number,
    categoriaId: number,
    comentario: string,
  ): Promise<{
    id: number;
    categoria: Referencia;
    area: Referencia;
    prioridad: Pick<Prioridad, 'puntajePrioridad' | 'prioridadManual' | 'factores'>;
    movimiento: Movimiento;
  }>;
  fijarPrioridad(id: number, valor: number, motivo: string): Promise<RespuestaPrioridad>;
  quitarPrioridad(id: number): Promise<RespuestaPrioridad>;
}

export function crearRepositorioGestion(cliente: ClienteApi): RepositorioGestion {
  return {
    async bandeja(filtros) {
      const consulta = aParametros(filtros).toString();
      const { incidentes } = await cliente.pedir<{ incidentes: IncidenteBandeja[] }>(
        consulta ? `/bandeja?${consulta}` : '/bandeja',
      );
      return incidentes;
    },
    ficha(id) {
      return cliente.pedir(`/incidentes/${id}/gestion`);
    },
    derivar(id, areaId, comentario) {
      return cliente.pedir(`/incidentes/${id}/derivacion`, {
        metodo: 'POST',
        cuerpo: conComentario({ areaId }, comentario),
      });
    },
    cambiarEstado(id, estado, comentario) {
      return cliente.pedir(`/incidentes/${id}/estado`, {
        metodo: 'POST',
        cuerpo: conComentario({ estado }, comentario),
      });
    },
    comentar(id, comentario) {
      return cliente.pedir(`/incidentes/${id}/comentarios`, {
        metodo: 'POST',
        cuerpo: { comentario: comentario.trim() },
      });
    },
    cambiarCategoria(id, categoriaId, comentario) {
      return cliente.pedir(`/incidentes/${id}/categoria`, {
        metodo: 'PUT',
        cuerpo: conComentario({ categoriaId }, comentario),
      });
    },
    fijarPrioridad(id, valor, motivo) {
      return cliente.pedir(`/incidentes/${id}/prioridad-manual`, {
        metodo: 'PUT',
        cuerpo: { valor, motivo: motivo.trim() },
      });
    },
    quitarPrioridad(id) {
      return cliente.pedir(`/incidentes/${id}/prioridad-manual`, { metodo: 'DELETE' });
    },
  };
}
