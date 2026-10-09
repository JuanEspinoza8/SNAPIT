import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

/**
 * Dónde viven los archivos de las fotos. En la base se guarda solo la ruta que devuelve guardar().
 * Esta implementación escribe en la carpeta FOTOS_DIR (en Docker, un volumen). Si la demo usa un
 * servicio de archivos, se agrega otra implementación con los mismos tres métodos.
 */
export const almacenFotos = {
  /** Guarda el archivo tal cual llegó, sin recomprimir (así se conserva el EXIF). Devuelve su ruta. */
  async guardar(contenido: Buffer, extension: 'jpg' | 'png'): Promise<string> {
    await mkdir(env.FOTOS_DIR, { recursive: true });
    const ruta = `${randomUUID()}.${extension}`;
    // 'wx': falla si ya existe, nunca pisa otra foto.
    await writeFile(path.join(env.FOTOS_DIR, ruta), contenido, { flag: 'wx' });
    return ruta;
  },

  /** Ubicación en disco de una ruta guardada. */
  ubicacion(ruta: string): string {
    return path.join(env.FOTOS_DIR, ruta);
  },

  /** Borra el archivo. No falla si ya no existe. */
  async borrar(ruta: string): Promise<void> {
    await rm(path.join(env.FOTOS_DIR, ruta), { force: true });
  },
};
