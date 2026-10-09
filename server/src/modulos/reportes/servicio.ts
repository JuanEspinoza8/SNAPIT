import { imageSize } from 'image-size';
import { almacenFotos } from '../../compartido/almacenFotos.js';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
import { logger } from '../../config/logger.js';
import { esquemaReporte } from './esquemas.js';
import * as repositorio from './repositorio.js';

const DIA_MS = 24 * 60 * 60 * 1000;
// Margen para relojes de celulares un poco adelantados.
const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

const datosInvalidos = (campo: string, mensaje: string) =>
  new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [{ campo, mensaje }]);

/** Lee el tipo y las medidas de la imagen mirando su contenido, no la extensión ni lo que dice el cliente. */
function leerImagen(contenido: Buffer): { tipo: 'jpg' | 'png'; ancho: number; alto: number } | null {
  try {
    const { type, width, height } = imageSize(contenido);
    if ((type === 'jpg' || type === 'png') && width && height)
      return { tipo: type, ancho: width, alto: height };
  } catch {
    // No es una imagen que image-size reconozca.
  }
  return null;
}

// Por si falta el parámetro (la semilla lo carga): antes que rechazar el reporte, se usa este valor.
const DIAS_VIGENCIA_SI_FALTA = 30;

async function diasVigenciaPorDefecto() {
  const dias = await repositorio.leerParametroEntero('vigencia.dias_default');
  if (dias !== null) return dias;
  logger.warn('Falta el parámetro vigencia.dias_default: se usan %d días', DIAS_VIGENCIA_SI_FALTA);
  return DIAS_VIGENCIA_SI_FALTA;
}

export async function crearReporte(usuarioId: number, cuerpo: unknown, archivo: Buffer | undefined) {
  const imagen = archivo ? leerImagen(archivo) : null;
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

  // Un incidente temporal (por ejemplo, una obra) vence solo: la base exige la fecha. Se cuenta desde
  // que llega y no desde registradoEn: un celular con la hora atrasada lo haría nacer vencido.
  let vigenteHasta: Date | null = null;
  if (categoria.tipoVigenciaDefault === 'TEMPORAL') {
    const dias = categoria.diasCaducidadDefault ?? (await diasVigenciaPorDefecto());
    vigenteHasta = new Date(ahora.getTime() + dias * DIA_MS);
  }

  // Primero el archivo y después la base. Si la base falla, se borra el archivo: nunca queda
  // un reporte sin foto ni una foto suelta.
  const rutaArchivo = await almacenFotos.guardar(archivo!, imagen!.tipo);
  try {
    return await repositorio.crearReporteConIncidente({
      usuarioId,
      categoriaId: categoria.id,
      severidad: datos.severidadDeclarada,
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
      },
    });
  } catch (error) {
    await almacenFotos.borrar(rutaArchivo).catch(() => {});
    throw error;
  }
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

export async function buscarArchivoFoto(id: number) {
  const foto = await repositorio.buscarFotoVisible(id);
  // Una foto que no se ve en el mapa responde igual que una que no existe: no se revela cuál es cuál.
  if (!foto) throw new ErrorApp(404, 'FOTO_NO_ENCONTRADA', 'La foto no existe');
  return almacenFotos.ubicacion(foto.rutaArchivo);
}
