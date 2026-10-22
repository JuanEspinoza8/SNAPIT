import { ErrorApp } from '../../compartido/errores.js';
import { prisma } from '../../compartido/prisma.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { leerBitacora } from '../incidentes/bitacora.js';
import { esquemaId } from '../incidentes/esquemas.js';
import { leerPrioridad } from '../prioridad/repositorio.js';
import { esquemaFiltrosBandeja } from './esquemas.js';
import * as repositorio from './repositorio.js';

const urlFoto = (id: number) => ({ id, url: `/api/fotos/${id}` });

/**
 * La bandeja del operador (F08): los incidentes verificados de su organismo, ordenados por prioridad y con
 * los motivos. Sin `areaId`, solo los de su área; un administrador sin área ve todo el organismo.
 */
export async function listarBandeja(sesion: UsuarioSesion, consulta: unknown) {
  const filtros = validar(esquemaFiltrosBandeja, consulta);
  if (sesion.organismoId === null) return { incidentes: [] };

  if (
    typeof filtros.areaId === 'number' &&
    !(await repositorio.esAreaDelOrganismo(filtros.areaId, sesion.organismoId))
  ) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: 'areaId', mensaje: 'No es un área de tu organismo' },
    ]);
  }
  const areaId = filtros.areaId === 'todas' ? undefined : (filtros.areaId ?? sesion.areaId ?? undefined);

  const filas = await repositorio.listarBandeja({ ...filtros, areaId, organismoId: sesion.organismoId });
  return {
    incidentes: filas.map(({ categoriaId, categoriaNombre, areaId: idArea, areaNombre, ...fila }) => ({
      ...fila,
      categoria: { id: categoriaId, nombre: categoriaNombre },
      area: { id: idArea, nombre: areaNombre },
    })),
  };
}

/**
 * La ficha de gestión de un incidente de su organismo, en cualquier estado: reportes con su confianza y sus
 * señales, fotos, bitácora, desglose de la prioridad y cierre. Un incidente unido se muestra a sí mismo (no
 * salta al principal, como la ficha pública), así se puede deshacer la unión desde ahí.
 */
export async function obtenerGestion(sesion: UsuarioSesion, parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  const incidente = await repositorio.buscarIncidente(id);
  if (!incidente) throw new ErrorApp(404, 'INCIDENTE_NO_ENCONTRADO', 'El incidente no existe');
  if (incidente.organismoId !== sesion.organismoId) {
    throw new ErrorApp(403, 'SIN_PERMISO', 'El incidente es de otro organismo');
  }

  const [unidos, reportes, bitacora, prioridad, cierre] = await Promise.all([
    repositorio.listarUnidos(id),
    repositorio.listarReportes(id),
    leerBitacora(id),
    leerPrioridad(prisma, id),
    repositorio.buscarCierre(id),
  ]);

  return {
    id: incidente.id,
    estado: incidente.estado,
    categoria: { id: incidente.categoriaId, nombre: incidente.categoriaNombre },
    area: { id: incidente.areaId, nombre: incidente.areaNombre },
    severidad: incidente.severidad,
    direccion: incidente.direccion,
    lat: incidente.lat,
    lon: incidente.lon,
    tipoVigencia: incidente.tipoVigencia,
    vigenteHasta: incidente.vigenteHasta,
    caducadoEn: incidente.caducadoEn,
    primerReporteEn: incidente.primerReporteEn,
    resueltoEn: incidente.resueltoEn,
    cantidadReportes: incidente.cantidadReportes,
    incidentePrincipalId: incidente.incidentePrincipalId,
    unidos,
    prioridad: {
      puntajePrioridad: prioridad.puntajePrioridad,
      prioridadManual: prioridad.prioridadManual,
      motivoPrioridadManual: prioridad.motivoPrioridadManual,
      ajustadaPor: prioridad.ajustadaPor,
      factores: prioridad.factores,
    },
    reportes: reportes.map(({ categoriaId, categoriaNombre, fotos, ...reporte }) => ({
      ...reporte,
      categoria: { id: categoriaId, nombre: categoriaNombre },
      fotos: fotos.map(urlFoto),
    })),
    bitacora,
    cierre: cierre && {
      id: cierre.id,
      resultadoComparacion: cierre.resultadoComparacion,
      distanciaMetros: cierre.distanciaMetros === null ? null : Number(cierre.distanciaMetros),
      detalleComparacion: cierre.detalleComparacion,
      creadoEn: cierre.creadoEn,
      usuario: cierre.usuario,
      // Se sirven desde la issue del cierre (corte 75 %), igual que las de los reportes.
      fotos: cierre.fotografias.map((foto) => urlFoto(foto.id)),
    },
  };
}
