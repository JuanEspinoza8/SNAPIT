import { almacenFotos } from '../../compartido/almacenFotos.js';
import { analizarFoto } from '../../compartido/analisisFoto.js';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import { logger } from '../../config/logger.js';
import type { UsuarioSesion } from '../auth/tokens.js';
import { leerParametros as leerParametrosAgrupacion } from '../agrupacion/repositorio.js';
import { completarDireccionSinEsperar } from '../geocodificacion/servicio.js';
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
 */
async function validarSugerencia(
  usuarioId: number,
  datos: DatosReporte,
): Promise<repositorio.SugerenciaDelReporte | null> {
  const { categoriaSugeridaId, severidadSugerida, registroIaId } = datos;
  const campos = { categoriaSugeridaId, severidadSugerida, registroIaId };
  const faltan = Object.entries(campos).filter(([, valor]) => valor === undefined);
  if (faltan.length === 3) return null;
  if (faltan.length > 0) {
    throw new ErrorApp(
      400,
      'DATOS_INVALIDOS',
      'Hay datos inválidos',
      faltan.map(([campo]) => ({ campo, mensaje: 'Va junto con los otros datos de la sugerencia' })),
    );
  }

  const registro = await repositorio.buscarSugerencia(registroIaId!);
  if (
    !registro ||
    registro.usuarioId !== usuarioId ||
    registro.tipo !== 'CLASIFICACION_IMAGEN' ||
    !registro.exito
  ) {
    throw datosInvalidos('registroIaId', 'No es una sugerencia de la IA pedida por vos');
  }
  if (registro.usada) throw datosInvalidos('registroIaId', 'Esa sugerencia ya se usó en otro reporte');
  const salida = registro.salida as { categoriaId?: unknown; severidad?: unknown } | null;
  if (salida?.categoriaId !== categoriaSugeridaId || salida?.severidad !== severidadSugerida) {
    throw datosInvalidos('registroIaId', 'No coincide con lo que sugirió la IA');
  }

  return {
    categoriaSugeridaId: categoriaSugeridaId!,
    severidadSugerida: severidadSugerida!,
    registroIaId: registroIaId!,
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

  const parametrosAgrupacion = await leerParametrosAgrupacion();
  // Antes de guardar: la foto todavía no está en la base, así que no se encuentra a sí misma como repetida.
  const verificacion = await verificarReporte({
    usuarioId,
    lat: datos.lat,
    lon: datos.lon,
    registradoEn,
    tomadaConCamaraApp: datos.tomadaConCamaraApp,
    exif: imagen!.exif,
    hashPerceptual: imagen!.hashPerceptual,
  });

  // Primero el archivo y después la base. Si la base falla, se borra el archivo: nunca queda
  // un reporte sin foto ni una foto suelta.
  const rutaArchivo = await almacenFotos.guardar(archivo!, imagen!.tipo);
  let reporte: Awaited<ReturnType<typeof repositorio.crearReporteConIncidente>>;
  try {
    reporte = await repositorio.crearReporteConIncidente(
      {
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
        tipoVigencia: categoria.tipoVigenciaDefault,
        vigenteHasta,
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
      },
      parametrosAgrupacion,
    );
  } catch (error) {
    await almacenFotos.borrar(rutaArchivo).catch(() => {});
    throw error;
  }

  // No se espera: Nominatim puede tardar y el vecino no tiene por qué esperarlo.
  completarDireccionSinEsperar({ id: reporte.id, lat: datos.lat, lon: datos.lon });
  return reporte;
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
