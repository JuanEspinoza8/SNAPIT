import { imageSize } from 'image-size';
import { almacenFotos } from '../../compartido/almacenFotos.js';
import { ErrorApp } from '../../compartido/errores.js';
import { validar } from '../../compartido/validar.js';
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

  // Un incidente temporal (por ejemplo, una obra) vence solo: la base exige la fecha.
  let vigenteHasta: Date | null = null;
  if (categoria.tipoVigenciaDefault === 'TEMPORAL') {
    const dias =
      categoria.diasCaducidadDefault ?? (await repositorio.leerParametroEntero('vigencia.dias_default', 30));
    vigenteHasta = new Date(registradoEn.getTime() + dias * DIA_MS);
  }

  // Primero el archivo y después la base. Si la base falla, se borra el archivo: nunca queda
  // un reporte sin foto ni una foto suelta.
  const rutaArchivo = await almacenFotos.guardar(archivo!, imagen!.tipo);
  try {
    return await repositorio.crearReporteConIncidente({
      usuarioId,
      categoriaId: categoria.id,
      areaId: categoria.areaId,
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

export async function buscarArchivoFoto(id: number) {
  const foto = await repositorio.buscarFoto(id);
  if (!foto) throw new ErrorApp(404, 'FOTO_NO_ENCONTRADA', 'La foto no existe');
  return almacenFotos.ubicacion(foto.rutaArchivo);
}
