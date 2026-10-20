import { almacenFotos } from '../../compartido/almacenFotos.js';
import { analizarFoto } from '../../compartido/analisisFoto.js';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import { logger } from '../../config/logger.js';
import { elegirIncidente, type ParametrosAgrupacion, severidadConsolidada } from '../agrupacion/calculo.js';
import * as agrupacion from '../agrupacion/repositorio.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { completarDireccionSinEsperar } from '../geocodificacion/servicio.js';
import { avisarCambioIncidente } from '../incidentes/eventos.js';
import type { Senal } from '../verificacion/calculo.js';
import { aplicarResultado } from '../verificacion/resultado.js';
import { modoDemostracion } from '../verificacion/repositorio.js';
import { verificarReporte } from '../verificacion/servicio.js';
import { type DatosReporte, esquemaReporte } from './esquemas.js';
import * as repositorio from './repositorio.js';

const DIA_MS = 24 * 60 * 60 * 1000;
// Margen para relojes de celulares un poco adelantados.
const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

const datosInvalidos = (campo: string, mensaje: string) =>
  new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [{ campo, mensaje }]);

// Por si falta el parámetro (la semilla lo carga): antes que rechazar el reporte, se usa este valor.
const DIAS_VIGENCIA_SI_FALTA = 30;

/**
 * Comprueba la sugerencia de la IA que manda el cliente contra lo que quedó en registro_ia: tiene que ser
 * una clasificación exitosa del mismo vecino, sin usar en otro reporte, y con la misma categoría y
 * severidad. Así nadie puede inventar sugerencias ni inflar cuántas se aceptan.
 *
 * Si no cumple, se descarta y el reporte se guarda igual, sin sugerencia (F06: el reporte se envía igual).
 * El vecino no tiene cómo arreglarla desde la pantalla: por ejemplo, si reintenta un envío cuya respuesta
 * se perdió, la sugerencia ya figura como usada.
 */
async function validarSugerencia(
  usuarioId: number,
  datos: DatosReporte,
): Promise<repositorio.SugerenciaDelReporte | null> {
  const { categoriaSugeridaId, severidadSugerida, registroIaId } = datos;
  const vinieron = [categoriaSugeridaId, severidadSugerida, registroIaId].filter(
    (valor) => valor !== undefined,
  );
  if (vinieron.length === 0) return null;

  const descartar = (motivo: string) => {
    logger.warn({ usuarioId, registroIaId }, 'Se descarta la sugerencia de la IA del reporte: %s', motivo);
    return null;
  };
  if (categoriaSugeridaId === undefined || severidadSugerida === undefined || registroIaId === undefined) {
    return descartar('faltan datos de la sugerencia');
  }

  const registro = await repositorio.buscarSugerencia(registroIaId);
  if (
    !registro ||
    registro.usuarioId !== usuarioId ||
    registro.tipo !== 'CLASIFICACION_IMAGEN' ||
    !registro.exito
  ) {
    return descartar('no es una sugerencia de la IA pedida por el vecino');
  }
  if (registro.usada) return descartar('ya se usó en otro reporte');
  const salida = registro.salida as { categoriaId?: unknown; severidad?: unknown } | null;
  if (salida?.categoriaId !== categoriaSugeridaId || salida?.severidad !== severidadSugerida) {
    return descartar('no coincide con lo que sugirió la IA');
  }

  return {
    categoriaSugeridaId,
    severidadSugerida,
    registroIaId,
    // Aceptada solo si el vecino dejó las dos cosas como las sugirió la IA.
    sugerenciaAceptada:
      datos.categoriaId === categoriaSugeridaId && datos.severidadDeclarada === severidadSugerida,
  };
}

async function diasVigenciaPorDefecto() {
  const dias = await repositorio.leerParametroEntero('vigencia.dias_default');
  if (dias !== null) return dias;
  logger.warn('Falta el parámetro vigencia.dias_default: se usan %d días', DIAS_VIGENCIA_SI_FALTA);
  return DIAS_VIGENCIA_SI_FALTA;
}

export async function crearReporte(usuarioId: number, cuerpo: unknown, archivo: Buffer | undefined) {
  const imagen = archivo ? await analizarFoto(archivo) : null;
  const problemaFoto = !archivo
    ? [{ campo: 'foto', mensaje: 'Es obligatoria' }]
    : !imagen
      ? [{ campo: 'foto', mensaje: 'Tiene que ser una imagen JPG o PNG' }]
      : [];
  const datos = validar(esquemaReporte, cuerpo ?? {}, problemaFoto);

  const ahora = new Date();
  const registradoEn = datos.registradoEn ?? ahora;
  if (registradoEn.getTime() > ahora.getTime() + TOLERANCIA_FUTURO_MS) {
    throw datosInvalidos('registradoEn', 'No puede ser una fecha futura');
  }
  // La cámara de la app suma confianza (ORIGEN_APP): desde el sitio web la foto siempre sale de un archivo.
  if (datos.origen === 'SITIO_WEB' && datos.tomadaConCamaraApp) {
    throw datosInvalidos(
      'tomadaConCamaraApp',
      'Desde el sitio web la foto no puede ser de la cámara de la app',
    );
  }

  const categoria = await repositorio.buscarCategoriaActiva(datos.categoriaId);
  if (!categoria) throw datosInvalidos('categoriaId', 'No existe o no está activa');
  const sugerencia = await validarSugerencia(usuarioId, datos);

  // Un incidente temporal (por ejemplo, una obra) vence solo: la base exige la fecha. Se cuenta desde
  // que llega y no desde registradoEn: un celular con la hora atrasada lo haría nacer vencido.
  let vigenteHasta: Date | null = null;
  if (categoria.tipoVigenciaDefault === 'TEMPORAL') {
    const dias = categoria.diasCaducidadDefault ?? (await diasVigenciaPorDefecto());
    vigenteHasta = new Date(ahora.getTime() + dias * DIA_MS);
  }

  const parametrosAgrupacion = await agrupacion.leerParametros();
  // Antes de guardar: la foto todavía no está en la base, así que no se encuentra a sí misma como repetida.
  let verificacion = await verificarReporte({
    usuarioId,
    lat: datos.lat,
    lon: datos.lon,
    registradoEn,
    tomadaConCamaraApp: datos.tomadaConCamaraApp,
    exif: imagen!.exif,
    hashPerceptual: imagen!.hashPerceptual,
  });
  // Modo demostración: el nivel y las señales se guardan igual, pero el reporte espera en la cola aunque la
  // verificación automática lo aprobaría, para mostrar la revisión manual y la de la IA (ia/cola.ts).
  if (verificacion.estado === 'VERIFICADO' && (await modoDemostracion())) {
    verificacion = { ...verificacion, estado: 'PENDIENTE_REVISION' };
  }

  // Primero el archivo y después la base. Si la base falla, se borra el archivo: nunca queda
  // un reporte sin foto ni una foto suelta.
  const rutaArchivo = await almacenFotos.guardar(archivo!, imagen!.tipo);
  let reporte: Awaited<ReturnType<typeof guardarReporte>>;
  try {
    reporte = await guardarReporte({
      reporte: {
        usuarioId,
        categoriaId: categoria.id,
        severidad: datos.severidadDeclarada,
        sugerencia,
        verificacion,
        descripcion: datos.descripcion,
        lat: datos.lat,
        lon: datos.lon,
        origen: datos.origen,
        registradoEn,
        sincronizadoEn: ahora,
      },
      vigencia: { tipoVigencia: categoria.tipoVigenciaDefault, vigenteHasta },
      foto: {
        rutaArchivo,
        ancho: imagen!.ancho,
        alto: imagen!.alto,
        tamanoBytes: archivo!.length,
        tomadaConCamaraApp: datos.tomadaConCamaraApp,
        hashPerceptual: imagen!.hashPerceptual,
        exifLatitud: imagen!.exif.latitud,
        exifLongitud: imagen!.exif.longitud,
        exifTomadaEn: imagen!.exif.tomadaEn,
        exifMarca: imagen!.exif.marca,
        exifModelo: imagen!.exif.modelo,
      },
      senales: verificacion.senales,
      parametrosAgrupacion,
    });
  } catch (error) {
    await almacenFotos.borrar(rutaArchivo).catch(() => {});
    throw error;
  }

  // No se espera: Nominatim puede tardar y el vecino no tiene por qué esperarlo.
  completarDireccionSinEsperar({ id: reporte.id, lat: datos.lat, lon: datos.lon });
  return reporte;
}

/**
 * Guarda el reporte con su foto y sus señales, y lo suma al incidente que corresponde (F05): al mejor
 * candidato si supera el umbral de agrupación, o a un incidente nuevo si no. Todo en una sola transacción:
 * o queda todo o nada, también el recálculo de la prioridad.
 */
function guardarReporte(alta: {
  reporte: Omit<repositorio.NuevoReporte, 'incidenteId'>;
  vigencia: Pick<repositorio.NuevoIncidente, 'tipoVigencia' | 'vigenteHasta'>;
  foto: repositorio.FotoDelReporte;
  senales: Senal[];
  parametrosAgrupacion: ParametrosAgrupacion;
}) {
  const { reporte, parametrosAgrupacion: parametros } = alta;
  return repositorio.transaccion(async (tx) => {
    await agrupacion.bloquearCategoria(tx, reporte.categoriaId);
    const candidatos = await agrupacion.buscarCandidatos(tx, {
      categoriaId: reporte.categoriaId,
      lat: reporte.lat,
      lon: reporte.lon,
      hashPerceptual: alta.foto.hashPerceptual,
      radioM: parametros.radioM,
      unosMinimosHash: parametros.unosMinimosHash,
    });
    const elegido = elegirIncidente(
      { categoriaId: reporte.categoriaId },
      candidatos,
      parametros,
      reporte.sincronizadoEn,
    );
    const incidenteId =
      elegido?.incidenteId ??
      (await repositorio.insertarIncidente(tx, {
        categoriaId: reporte.categoriaId,
        severidad: reporte.severidad,
        lat: reporte.lat,
        lon: reporte.lon,
        ...alta.vigencia,
        primerReporteEn: reporte.registradoEn,
      }));

    const guardado = await repositorio.insertarReporte(tx, { ...reporte, incidenteId });
    await repositorio.guardarFoto(tx, guardado.id, alta.foto);
    await repositorio.guardarSenales(tx, guardado.id, alta.senales);

    // Con el reporte ya guardado: la cantidad y la severidad consolidada lo incluyen.
    const severidad = severidadConsolidada(await agrupacion.severidadesDeclaradas(tx, incidenteId));
    await repositorio.sumarReporte(tx, incidenteId, { severidad, actualizadoEn: reporte.sincronizadoEn });
    // Verificado al llegar: cuenta para la reputación del vecino y puede verificar el incidente. Uno pendiente
    // espera la revisión del operador (verificacion/revision.ts).
    if (guardado.estadoVerificacion === 'VERIFICADO') {
      await aplicarResultado(tx, {
        reporteId: guardado.id,
        decision: 'VERIFICADO',
        operadorId: null,
        comentario: null,
      });
    }
    await avisarCambioIncidente(tx, incidenteId);

    return {
      id: guardado.id,
      incidenteId,
      nivelConfianza: guardado.nivelConfianza,
      estadoVerificacion: guardado.estadoVerificacion,
    };
  });
}

/** Lo que el vecino ve en "Mis reportes": qué mandó y en qué quedó cada uno. */
export async function listarMisReportes(usuarioId: number) {
  const filas = await repositorio.listarDeUsuario(usuarioId);
  return {
    reportes: filas.map((fila) => ({
      id: fila.id,
      registradoEn: fila.registradoEn,
      categoria: { id: fila.categoriaId, nombre: fila.categoriaNombre },
      severidadDeclarada: fila.severidadDeclarada,
      descripcion: fila.descripcion,
      fotos: fila.fotos.map((fotoId) => ({ id: fotoId, url: `/api/fotos/${fotoId}` })),
      estadoVerificacion: fila.estadoVerificacion,
      incidente:
        fila.incidenteId === null
          ? null
          : {
              id: fila.incidenteId,
              estado: fila.incidenteEstado,
              enRevision: fila.incidenteEstado === 'REGISTRADO',
            },
    })),
  };
}

/**
 * Sin sesión, solo las fotos del mapa. Con sesión, además, las de los reportes propios y, para
 * operadores y administradores, las de los incidentes de su organismo.
 */
export async function buscarArchivoFoto(id: number, usuario: UsuarioSesion | null) {
  const gestiona = usuario?.rol === 'OPERADOR' || usuario?.rol === 'ADMINISTRADOR';
  const foto = await repositorio.buscarFotoPermitida(id, {
    usuarioId: usuario?.id ?? null,
    // Un administrador sin organismo no gestiona incidentes: ve solo las del mapa.
    organismoId: gestiona ? usuario.organismoId : null,
  });
  // Una foto que no puede ver responde igual que una que no existe: no se revela cuál es cuál.
  if (!foto) throw new ErrorApp(404, 'FOTO_NO_ENCONTRADA', 'La foto no existe');
  return almacenFotos.ubicacion(foto.rutaArchivo);
}
