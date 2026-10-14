import type { ClienteApi } from './cliente.js';
import type { DatosReporte, ReporteEnviado } from '../../funcionalidades/reportar/tipos.js';
import type { ReporteMio } from '../../funcionalidades/misReportes/tipos.js';

export interface RepositorioReportes {
  enviar(datos: DatosReporte): Promise<ReporteEnviado>;
  /** Los reportes del vecino de la sesión, del más nuevo al más viejo. */
  mios(): Promise<ReporteMio[]>;
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
  };
}
