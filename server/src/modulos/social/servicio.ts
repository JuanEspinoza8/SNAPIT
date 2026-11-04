import { ErrorApp } from '../../compartido/errores.js';
import { buscarVisible } from '../incidentes/servicio.js';
import * as repositorio from './repositorio.js';
import type { ReportePublico } from './repositorio.js';

const reporteNoEncontrado = () => new ErrorApp(404, 'REPORTE_NO_ENCONTRADO', 'El reporte no existe');

type Numeros = Map<number, number>;

/**
 * Del autor no se publica nada que lo identifique, ni el nombre ni el id: dentro de cada incidente es «Vecino N».
 * Así se sigue quién dijo qué en una conversación, pero no se puede saber si dos incidentes los reportó la misma
 * persona, ni armar por dónde anduvo alguien.
 */
function autor(numeros: Numeros, usuarioId: number) {
  let numero = numeros.get(usuarioId);
  // Llegó entre la consulta que numera y esta: va al final, como el último en llegar.
  if (numero === undefined) {
    numero = numeros.size + 1;
    numeros.set(usuarioId, numero);
  }
  return { numero, nombre: `Vecino ${numero}` };
}

const presentarReporte =
  (numeros: Numeros) =>
  ({ usuarioId, fotoIds, cantidadMeGusta, cantidadComentarios, ...datos }: ReportePublico) => ({
    ...datos,
    autor: autor(numeros, usuarioId),
    fotos: fotoIds.map((id) => ({ id, url: `/api/fotos/${id}` })),
    // count() de PostgreSQL llega como bigint: se pasa a número para el JSON.
    cantidadMeGusta: Number(cantidadMeGusta),
    cantidadComentarios: Number(cantidadComentarios),
  });

const presentarComentario =
  (numeros: Numeros) =>
  ({ usuarioId, ...datos }: Awaited<ReturnType<typeof repositorio.listarComentarios>>[number]) => ({
    ...datos,
    autor: autor(numeros, usuarioId),
  });

export async function listarReportesDeIncidente(id: number) {
  const incidente = await buscarVisible(id);
  const [reportes, numeros] = await Promise.all([
    repositorio.listarReportes(incidente.id),
    repositorio.numerarParticipantes(incidente.id),
  ]);
  return { incidenteId: incidente.id, reportes: reportes.map(presentarReporte(numeros)) };
}

export async function obtenerReporte(id: number) {
  const reporte = await repositorio.buscarReporte(id);
  if (!reporte) throw reporteNoEncontrado();
  return presentarReporte(await repositorio.numerarParticipantes(reporte.incidenteId))(reporte);
}

export async function listarComentariosDeReporte(id: number) {
  const reporte = await repositorio.buscarReporte(id);
  if (!reporte) throw reporteNoEncontrado();
  const [comentarios, numeros] = await Promise.all([
    repositorio.listarComentarios({ reporteId: id }),
    repositorio.numerarParticipantes(reporte.incidenteId),
  ]);
  return { comentarios: comentarios.map(presentarComentario(numeros)) };
}

export async function listarComentariosDeIncidente(id: number) {
  const incidente = await buscarVisible(id);
  const [comentarios, numeros] = await Promise.all([
    repositorio.listarComentarios({ principalId: incidente.id }),
    repositorio.numerarParticipantes(incidente.id),
  ]);
  return { incidenteId: incidente.id, comentarios: comentarios.map(presentarComentario(numeros)) };
}
