import type { ClienteApi } from './cliente.js';

interface IncidenteResumido {
  id: number;
  estado: string;
  cantidadReportes: number;
  severidad: string;
}

/** Corregir la agrupación automática (F05, docs/api.md): separar un reporte y unir o desunir incidentes. */
export interface RepositorioIncidentes {
  separarReporte(
    reporteId: number,
    comentario: string,
  ): Promise<{ reporteId: number; incidenteNuevo: IncidenteResumido; incidenteOriginal: IncidenteResumido }>;
  unir(
    id: number,
    principalId: number,
    comentario: string,
  ): Promise<{ id: number; principal: IncidenteResumido }>;
  deshacerUnion(id: number): Promise<{ id: number; principal: IncidenteResumido }>;
}

// Un comentario vacío no se manda: para el servidor es opcional.
const conComentario = <T extends object>(cuerpo: T, comentario: string) => {
  const texto = comentario.trim();
  return texto ? { ...cuerpo, comentario: texto } : cuerpo;
};

export function crearRepositorioIncidentes(cliente: ClienteApi): RepositorioIncidentes {
  return {
    separarReporte(reporteId, comentario) {
      return cliente.pedir(`/reportes/${reporteId}/separacion`, {
        metodo: 'POST',
        cuerpo: conComentario({}, comentario),
      });
    },
    unir(id, principalId, comentario) {
      return cliente.pedir(`/incidentes/${id}/union`, {
        metodo: 'POST',
        cuerpo: conComentario({ principalId }, comentario),
      });
    },
    deshacerUnion(id) {
      return cliente.pedir(`/incidentes/${id}/union`, { metodo: 'DELETE' });
    },
  };
}
