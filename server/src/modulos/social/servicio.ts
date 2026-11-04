import { ErrorApp } from '../../compartido/errores.js';
import { buscarVisible } from '../incidentes/servicio.js';
import * as repositorio from './repositorio.js';
import type { ReportePublico } from './repositorio.js';

const reporteNoEncontrado = () => new ErrorApp(404, 'REPORTE_NO_ENCONTRADO', 'El reporte no existe');

// El autor va solo con su nombre: el correo y el rol no son públicos.
const presentarReporte = ({
  autorId,
  autorNombre,
  fotoIds,
  cantidadMeGusta,
  cantidadComentarios,
  ...datos
}: ReportePublico) => ({
  ...datos,
  autor: { id: autorId, nombre: autorNombre },
  fotos: fotoIds.map((id) => ({ id, url: `/api/fotos/${id}` })),
  // count() de PostgreSQL llega como bigint: se pasa a número para el JSON.
  cantidadMeGusta: Number(cantidadMeGusta),
  cantidadComentarios: Number(cantidadComentarios),
});

const presentarComentario = ({
  usuario,
  ...datos
}: Awaited<ReturnType<typeof repositorio.listarComentarios>>[number]) => ({ ...datos, autor: usuario });

export async function listarReportesDeIncidente(id: number) {
  const incidente = await buscarVisible(id);
  const reportes = await repositorio.listarReportes(incidente.id);
  return { incidenteId: incidente.id, reportes: reportes.map(presentarReporte) };
}

export async function obtenerReporte(id: number) {
  const reporte = await repositorio.buscarReporte(id);
  if (!reporte) throw reporteNoEncontrado();
  return presentarReporte(reporte);
}

export async function listarComentariosDeReporte(id: number) {
  const reporte = await repositorio.buscarReporte(id);
  if (!reporte) throw reporteNoEncontrado();
  const comentarios = await repositorio.listarComentarios({ reporteId: id });
  return { comentarios: comentarios.map(presentarComentario) };
}

export async function listarComentariosDeIncidente(id: number) {
  const incidente = await buscarVisible(id);
  const comentarios = await repositorio.listarComentarios({ incidenteId: incidente.id });
  return { incidenteId: incidente.id, comentarios: comentarios.map(presentarComentario) };
}
