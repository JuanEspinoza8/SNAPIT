import { aWebp, normalizarFoto } from '../compartido/analisisFoto.js';
import { almacenFotos } from '../compartido/almacenFotos.js';
import { prisma } from '../compartido/prisma.js';
import { logger } from '../config/logger.js';

export interface ResumenCompresion {
  fotos: number;
  comprimidas: number;
  /** Las que no se pudieron leer o convertir: quedan como estaban. */
  fallidas: number;
  bytesAntes: number;
  bytesDespues: number;
}

/**
 * Pasa a WebP las fotos que se guardaron antes de que las nuevas se guardaran así (analisisFoto.ts): las de los
 * reportes y las de los cierres. Para cada una guarda la WebP, actualiza su fila (ruta, medidas y tamaño) y recién
 * después borra el original: si algo falla en el medio, la foto sigue en el original y se puede volver a correr.
 * El EXIF, el hash y lo demás ya están en la fila: no se tocan. Con `probar`, solo cuenta cuánto se ahorraría.
 * Con `ids`, solo esas fotos (los tests no tocan las de otros tests que corren a la vez).
 */
export async function comprimirFotosGuardadas({
  probar = false,
  ids,
}: { probar?: boolean; ids?: number[] } = {}): Promise<ResumenCompresion> {
  const fotos = await prisma.fotografia.findMany({
    where: { NOT: { rutaArchivo: { endsWith: '.webp' } }, ...(ids && { id: { in: ids } }) },
    select: { id: true, rutaArchivo: true },
    orderBy: { id: 'asc' },
  });
  const resumen: ResumenCompresion = {
    fotos: fotos.length,
    comprimidas: 0,
    fallidas: 0,
    bytesAntes: 0,
    bytesDespues: 0,
  };

  for (const foto of fotos) {
    try {
      const original = await almacenFotos.leer(foto.rutaArchivo);
      const normalizada = original && (await normalizarFoto(original));
      const webp = normalizada && (await aWebp(normalizada));
      if (!original || !webp) {
        resumen.fallidas += 1;
        logger.warn({ fotoId: foto.id }, 'No se pudo comprimir la foto: queda como estaba');
        continue;
      }
      resumen.bytesAntes += original.length;
      resumen.bytesDespues += webp.archivo.length;
      if (probar) continue;

      const ruta = await almacenFotos.guardar(webp.archivo, 'webp');
      try {
        await prisma.fotografia.update({
          where: { id: foto.id },
          data: { rutaArchivo: ruta, ancho: webp.ancho, alto: webp.alto, tamanoBytes: webp.archivo.length },
        });
      } catch (error) {
        await almacenFotos.borrar(ruta).catch(() => {});
        throw error;
      }
      await almacenFotos.borrar(foto.rutaArchivo);
      resumen.comprimidas += 1;
    } catch (error) {
      resumen.fallidas += 1;
      logger.error({ err: error, fotoId: foto.id }, 'Falló la compresión de una foto: queda como estaba');
    }
  }
  return resumen;
}
