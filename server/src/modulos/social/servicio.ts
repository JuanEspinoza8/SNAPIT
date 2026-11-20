import { ErrorApp } from '../../compartido/errores.js';
import { idUsuarioSistema, USUARIO_SISTEMA } from '../../compartido/usuarioSistema.js';
import { validar } from '../../compartido/validar.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { codificarCursor, esquemaId, type PedidoFeed } from '../incidentes/esquemas.js';
import { buscarVisible } from '../incidentes/servicio.js';
import { esquemaComentario } from './esquemas.js';
import * as repositorio from './repositorio.js';
import type { ReportePublico } from './repositorio.js';

const reporteNoEncontrado = () => new ErrorApp(404, 'REPORTE_NO_ENCONTRADO', 'El reporte no existe');
const comentarioNoEncontrado = () => new ErrorApp(404, 'COMENTARIO_NO_ENCONTRADO', 'El comentario no existe');

/** El número de cada vecino en el incidente y el id del usuario de SnapIt, que no se numera. */
interface Numeros {
  vecinos: Map<number, number>;
  sistemaId: number | null;
}

async function numerar(principalId: number): Promise<Numeros> {
  const sistemaId = await idUsuarioSistema();
  return { vecinos: await repositorio.numerarParticipantes(principalId, sistemaId), sistemaId };
}

/**
 * Del autor no se publica nada que lo identifique, ni el nombre ni el id: dentro de cada incidente es «Vecino N».
 * Así se sigue quién dijo qué en una conversación, pero no se puede saber si dos incidentes los reportó la misma
 * persona, ni armar por dónde anduvo alguien. SnapIt sí aparece con su nombre, y `sistema` para distinguirlo.
 */
function autor({ vecinos: numeros, sistemaId }: Numeros, usuarioId: number) {
  if (usuarioId === sistemaId) return { numero: null, nombre: USUARIO_SISTEMA.nombre, sistema: true };
  let numero = numeros.get(usuarioId);
  // Llegó entre la consulta que numera y esta: va al final, como el último en llegar.
  if (numero === undefined) {
    numero = numeros.size + 1;
    numeros.set(usuarioId, numero);
  }
  return { numero, nombre: `Vecino ${numero}`, sistema: false };
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

type ComentarioGuardado = Awaited<ReturnType<typeof repositorio.listarComentarios>>[number];

/** `esMio`: si lo escribió quien consulta, para ofrecerle editarlo o eliminarlo. Sin sesión, false. */
const presentarComentario =
  (numeros: Numeros, sesionId: number | null) =>
  ({ usuarioId, ...datos }: ComentarioGuardado) => ({
    ...datos,
    autor: autor(numeros, usuarioId),
    esMio: usuarioId === sesionId,
  });

export async function listarReportesDeIncidente(id: number, sesionId: number | null = null) {
  const incidente = await buscarVisible(id);
  const [reportes, numeros] = await Promise.all([
    repositorio.listarReportes(incidente.id, sesionId),
    numerar(incidente.id),
  ]);
  return { incidenteId: incidente.id, reportes: reportes.map(presentarReporte(numeros)) };
}

export async function obtenerReporte(id: number, sesionId: number | null = null) {
  const reporte = await repositorio.buscarReporte(id, sesionId);
  if (!reporte) throw reporteNoEncontrado();
  return presentarReporte(await numerar(reporte.incidenteId))(reporte);
}

export async function listarComentariosDeReporte(id: number, sesionId: number | null = null) {
  const reporte = await repositorio.buscarReporte(id);
  if (!reporte) throw reporteNoEncontrado();
  const [comentarios, numeros] = await Promise.all([
    repositorio.listarComentarios({ reporteId: id }),
    numerar(reporte.incidenteId),
  ]);
  return { comentarios: comentarios.map(presentarComentario(numeros, sesionId)) };
}

export async function listarComentariosDeIncidente(id: number, sesionId: number | null = null) {
  const incidente = await buscarVisible(id);
  const [comentarios, numeros] = await Promise.all([
    repositorio.listarComentarios({ principalId: incidente.id }),
    numerar(incidente.id),
  ]);
  return {
    incidenteId: incidente.id,
    comentarios: comentarios.map(presentarComentario(numeros, sesionId)),
  };
}

/** Un reporte que el público ve, o 404: solo esos se pueden marcar con me gusta o comentar (#149). */
async function reporteVisible(parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  const reporte = await repositorio.buscarReporte(id);
  if (!reporte) throw reporteNoEncontrado();
  return reporte;
}

/** Da me gusta a un reporte. Darlo dos veces no falla ni lo duplica. Devuelve el contador nuevo. */
export async function darMeGusta(sesion: UsuarioSesion, parametros: unknown) {
  const reporte = await reporteVisible(parametros);
  await repositorio.darMeGusta(reporte.id, sesion.id);
  return {
    reporteId: reporte.id,
    cantidadMeGusta: await repositorio.contarMeGusta(reporte.id),
    yaMeGusta: true,
  };
}

/** Quita el me gusta. Quitar uno que no se dio no falla. */
export async function quitarMeGusta(sesion: UsuarioSesion, parametros: unknown) {
  const reporte = await reporteVisible(parametros);
  await repositorio.quitarMeGusta(reporte.id, sesion.id);
  return {
    reporteId: reporte.id,
    cantidadMeGusta: await repositorio.contarMeGusta(reporte.id),
    yaMeGusta: false,
  };
}

export async function comentarReporte(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const reporte = await reporteVisible(parametros);
  const { texto } = validar(esquemaComentario, cuerpo);
  const comentario = await repositorio.comentarReporte(reporte.id, sesion.id, texto);
  return presentarComentario(await numerar(reporte.incidenteId), sesion.id)(comentario);
}

/**
 * Un comentario sobre el problema en general, en la ficha del incidente. En un incidente unido va al principal,
 * que es donde se lee. Un incidente que no se ve, 404.
 */
export async function comentarIncidente(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { id } = validar(esquemaId, parametros);
  const incidente = await buscarVisible(id);
  const { texto } = validar(esquemaComentario, cuerpo);
  const comentario = await repositorio.comentarIncidente(incidente.id, sesion.id, texto);
  return presentarComentario(await numerar(incidente.id), sesion.id)(comentario);
}

/**
 * Un comentario que todavía se ve, con el incidente que ve el público para numerar a su autor. Si se eliminó, o
 * su reporte o su incidente ya no se ven, 404.
 */
async function comentarioVisible(parametros: unknown) {
  const { id } = validar(esquemaId, parametros);
  const comentario = await repositorio.buscarComentario(id);
  if (!comentario) throw comentarioNoEncontrado();
  if (comentario.reporteId !== null) {
    const reporte = await repositorio.buscarReporte(comentario.reporteId);
    if (!reporte) throw comentarioNoEncontrado();
    return { comentario, principalId: reporte.incidenteId };
  }
  const incidente = await buscarVisible(comentario.incidenteId!).catch(() => {
    throw comentarioNoEncontrado();
  });
  return { comentario, principalId: incidente.id };
}

/** Solo su autor lo edita. Queda con `editadoEn`. */
export async function editarComentario(sesion: UsuarioSesion, parametros: unknown, cuerpo: unknown) {
  const { comentario, principalId } = await comentarioVisible(parametros);
  if (comentario.usuarioId !== sesion.id) {
    throw new ErrorApp(403, 'SIN_PERMISO', 'Solo quien escribió el comentario lo puede editar');
  }
  const { texto } = validar(esquemaComentario, cuerpo);
  const editado = await repositorio.editarComentario(comentario.id, texto);
  return presentarComentario(await numerar(principalId), sesion.id)(editado);
}

/** Lo elimina su autor, o un operador o un administrador si es ofensivo. Baja lógica (`eliminado_en`). */
export async function eliminarComentario(sesion: UsuarioSesion, parametros: unknown) {
  const { comentario } = await comentarioVisible(parametros);
  const modera = sesion.rol === 'OPERADOR' || sesion.rol === 'ADMINISTRADOR';
  if (comentario.usuarioId !== sesion.id && !modera) {
    throw new ErrorApp(403, 'SIN_PERMISO', 'Solo quien escribió el comentario lo puede eliminar');
  }
  await repositorio.eliminarComentario(comentario.id);
}

/**
 * El feed: cada reporte publicado es una publicación, con su autor (el número que tiene en su incidente), su
 * foto, lo social y una línea hacia su incidente (estado y cuántos vecinos lo reportaron). Un mismo problema
 * reportado por varios vecinos aparece una vez por cada uno.
 */
export async function listarFeed(pedido: PedidoFeed, sesionId: number | null = null) {
  const filas = await repositorio.listarFeed(pedido, sesionId);
  const pagina = filas.slice(0, pedido.limite);
  const incidentes = [...new Set(pagina.map((fila) => fila.incidenteId))];
  const numeros = new Map(await Promise.all(incidentes.map(async (id) => [id, await numerar(id)] as const)));
  const ultima = pagina.at(-1);
  return {
    reportes: pagina.map(
      ({
        cursorMicrosegundos: _cursor,
        categoriaId,
        categoriaNombre,
        incidenteEstado,
        resueltoEn,
        cantidadVecinos,
        ...reporte
      }) => ({
        ...presentarReporte(numeros.get(reporte.incidenteId)!)(reporte),
        categoria: { id: categoriaId, nombre: categoriaNombre },
        incidente: {
          id: reporte.incidenteId,
          estado: incidenteEstado,
          resueltoEn,
          cantidadVecinos: Number(cantidadVecinos),
        },
      }),
    ),
    // Vino una fila de más: hay otra página, que arranca después de la última que se muestra.
    siguiente:
      filas.length > pedido.limite && ultima
        ? codificarCursor({ microsegundos: Number(ultima.cursorMicrosegundos), id: ultima.id })
        : null,
  };
}
