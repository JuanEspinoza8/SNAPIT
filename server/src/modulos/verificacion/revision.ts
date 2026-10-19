import { ErrorApp } from '../../compartido/errores.js';
import { prisma } from '../../compartido/prisma.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { avisarCambioIncidente } from '../incidentes/eventos.js';
import { esquemaIdReporte, esquemaRevision } from './esquemas.js';
import * as repositorio from './repositorio.js';
import { aplicarResultado } from './resultado.js';

/**
 * Los reportes de baja confianza que esperan la revisión de un operador (F04), solo los de los incidentes
 * de su organismo. Con lo que el operador necesita para decidir: la foto, las señales y el historial del vecino.
 */
export async function listarPendientes(sesion: UsuarioSesion) {
  if (sesion.organismoId === null) return { reportes: [] };
  const filas = await repositorio.listarPendientes(sesion.organismoId);
  return {
    reportes: filas.map((fila) => ({
      id: fila.id,
      registradoEn: fila.registradoEn,
      categoria: { id: fila.categoriaId, nombre: fila.categoriaNombre },
      severidadDeclarada: fila.severidadDeclarada,
      descripcion: fila.descripcion,
      direccion: fila.direccion,
      lat: fila.lat,
      lon: fila.lon,
      origen: fila.origen,
      nivelConfianza: fila.nivelConfianza,
      senales: fila.senales.map((senal) => ({ ...senal, valor: Number(senal.valor) })),
      fotos: fila.fotos.map((fotoId) => ({ id: fotoId, url: `/api/fotos/${fotoId}` })),
      incidente:
        fila.incidenteId === null
          ? null
          : { id: fila.incidenteId, estado: fila.incidenteEstado, cantidadReportes: fila.cantidadReportes },
      // El historial, no quién es: para decidir alcanza con saber cuánto acertó antes.
      vecino: {
        reputacion: Number(fila.reputacion),
        reportesConfirmados: fila.reportesConfirmados,
        reportesDesestimados: fila.reportesDesestimados,
      },
    })),
  };
}

/** El operador verifica o desestima un reporte pendiente de su organismo. Todo en una transacción. */
export async function revisarReporte(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaIdReporte, parametros);
  const { decision, comentario } = validar(esquemaRevision, cuerpo ?? {});

  return prisma.$transaction(async (tx) => {
    const reporte = await repositorio.bloquearReporte(tx, id);
    if (!reporte) throw new ErrorApp(404, 'REPORTE_NO_ENCONTRADO', 'El reporte no existe');
    if (reporte.organismoId !== sesion.organismoId) {
      throw new ErrorApp(403, 'SIN_PERMISO', 'El reporte es de un incidente de otro organismo');
    }
    if (reporte.estado !== 'PENDIENTE_REVISION') {
      throw new ErrorApp(409, 'REPORTE_YA_REVISADO', 'El reporte ya fue revisado');
    }

    await repositorio.cambiarEstadoReporte(tx, id, decision);
    const efecto = await aplicarResultado(tx, { reporteId: id, decision, operadorId: sesion.id, comentario });
    if (efecto.incidente) await avisarCambioIncidente(tx, efecto.incidente.id);

    return {
      id,
      estadoVerificacion: decision,
      incidente: efecto.incidente,
      vecino: { reputacion: efecto.reputacion },
    };
  });
}
