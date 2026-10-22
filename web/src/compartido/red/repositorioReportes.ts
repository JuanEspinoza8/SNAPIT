import type { ClienteApi } from './cliente.js';
import type { DatosReporte, ReporteEnviado } from '../../funcionalidades/reportar/tipos.js';
import type { ReporteMio } from '../../funcionalidades/misReportes/tipos.js';
import type {
  DecisionRevision,
  ReporteDelOrganismo,
  ReportePendiente,
  ResultadoRevision,
} from '../../funcionalidades/revision/tipos.js';

export interface RepositorioReportes {
  enviar(datos: DatosReporte): Promise<ReporteEnviado>;
  /** Los reportes del vecino de la sesión, del más nuevo al más viejo. */
  mios(): Promise<ReporteMio[]>;
  /** Los reportes de baja confianza a revisar, del más viejo al más nuevo. */
  pendientes(): Promise<ReportePendiente[]>;
  /** Todos los reportes del organismo, en cualquier estado, del más nuevo al más viejo. */
  delOrganismo(): Promise<ReporteDelOrganismo[]>;
  /** Verifica o desestima un reporte pendiente, con comentario opcional. */
  revisar(id: number, decision: DecisionRevision, comentario: string): Promise<ResultadoRevision>;
}

export function crearRepositorioReportes(cliente: ClienteApi): RepositorioReportes {
  return {
    enviar(datos) {
      const formulario = new FormData();
      formulario.append('foto', datos.foto);
      formulario.append('categoriaId', String(datos.categoriaId));
      formulario.append('severidadDeclarada', datos.severidad);
      formulario.append('lat', String(datos.lat));
      formulario.append('lon', String(datos.lon));
      formulario.append('origen', 'SITIO_WEB');
      const descripcion = datos.descripcion.trim();
      if (descripcion) formulario.append('descripcion', descripcion);
      return cliente.pedir<ReporteEnviado>('/reportes', { metodo: 'POST', cuerpo: formulario });
    },
    async mios() {
      // Va con sesión (sin sinSesion): el servidor saca el vecino del token.
      const { reportes } = await cliente.pedir<{ reportes: ReporteMio[] }>('/reportes/mios');
      return reportes;
    },
    async pendientes() {
      const { reportes } = await cliente.pedir<{ reportes: ReportePendiente[] }>('/reportes/pendientes');
      return reportes;
    },
    async delOrganismo() {
      // Sin filtros: la pantalla filtra y cuenta por estado con la lista completa (hasta 500).
      const { reportes } = await cliente.pedir<{ reportes: ReporteDelOrganismo[] }>('/reportes?limite=500');
      return reportes;
    },
    revisar(id, decision, comentario) {
      // Un comentario vacío no se manda: para el servidor es opcional.
      const texto = comentario.trim();
      const cuerpo = texto ? { decision, comentario: texto } : { decision };
      return cliente.pedir<ResultadoRevision>(`/reportes/${id}/revision`, { metodo: 'POST', cuerpo });
    },
  };
}
