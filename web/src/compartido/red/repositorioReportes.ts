import type { ClienteApi } from './cliente.js';
import type { DatosReporte, ReporteEnviado } from '../../funcionalidades/reportar/tipos.js';

export interface RepositorioReportes {
  enviar(datos: DatosReporte): Promise<ReporteEnviado>;
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
  };
}
