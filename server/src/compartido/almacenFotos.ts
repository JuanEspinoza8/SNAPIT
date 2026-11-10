import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

export type ExtensionFoto = 'jpg' | 'png';

/**
 * Dónde viven los archivos de las fotos. En la base se guarda solo la ruta que devuelve guardar(), así que
 * cambiar de almacén no toca el modelo. FOTOS_ALMACEN elige cuál se usa.
 */
export interface AlmacenFotos {
  /** Guarda el archivo tal cual llegó, sin recomprimir (así se conserva el EXIF). Devuelve su ruta. */
  guardar(contenido: Buffer, extension: ExtensionFoto): Promise<string>;
  /** El archivo de una ruta guardada, o null si ya no está. */
  leer(ruta: string): Promise<Buffer | null>;
  /** Borra el archivo. No falla si ya no existe. */
  borrar(ruta: string): Promise<void>;
}

const nuevaRuta = (extension: ExtensionFoto) => `${randomUUID()}.${extension}`;

/** En una carpeta del disco (en Docker, un volumen). Es la de desarrollo y la de los tests. */
export function almacenDisco(carpeta: string): AlmacenFotos {
  return {
    async guardar(contenido, extension) {
      await mkdir(carpeta, { recursive: true });
      const ruta = nuevaRuta(extension);
      // 'wx': falla si ya existe, nunca pisa otra foto.
      await writeFile(path.join(carpeta, ruta), contenido, { flag: 'wx' });
      return ruta;
    },

    async leer(ruta) {
      try {
        return await readFile(path.join(carpeta, ruta));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },

    async borrar(ruta) {
      await rm(path.join(carpeta, ruta), { force: true });
    },
  };
}

export interface ConfigSupabase {
  url: string;
  claveSecreta: string;
  bucket: string;
}

// Una foto de 10 MB entre Render y Supabase tarda menos de un segundo; esto corta solo si el servicio no responde.
const PLAZO_MS = 30_000;

const TIPOS: Record<ExtensionFoto, string> = { jpg: 'image/jpeg', png: 'image/png' };

/**
 * En un bucket privado de Supabase Storage, por su API REST. Es la de la demo publicada: Render borra el
 * disco en cada reinicio. La clave secreta salta los permisos del bucket, así que nunca sale del servidor.
 */
export function almacenSupabase(config: ConfigSupabase, pedir: typeof fetch = fetch): AlmacenFotos {
  const objeto = (ruta: string) => `${config.url}/storage/v1/object/${config.bucket}/${ruta}`;
  const cabeceras = { apikey: config.claveSecreta };

  async function fallo(res: Response, accion: string): Promise<never> {
    throw new Error(`Supabase Storage respondió ${res.status} al ${accion}: ${await res.text()}`);
  }

  return {
    async guardar(contenido, extension) {
      const ruta = nuevaRuta(extension);
      // Sin x-upsert, Supabase rechaza una ruta que ya existe: igual que 'wx' en el disco.
      const res = await pedir(objeto(ruta), {
        method: 'POST',
        headers: { ...cabeceras, 'Content-Type': TIPOS[extension] },
        body: new Uint8Array(contenido),
        signal: AbortSignal.timeout(PLAZO_MS),
      });
      if (!res.ok) await fallo(res, 'guardar la foto');
      return ruta;
    },

    async leer(ruta) {
      const res = await pedir(`${config.url}/storage/v1/object/authenticated/${config.bucket}/${ruta}`, {
        headers: cabeceras,
        signal: AbortSignal.timeout(PLAZO_MS),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (await noExiste(res)) return null;
      return fallo(res, 'leer la foto');
    },

    async borrar(ruta) {
      const res = await pedir(objeto(ruta), {
        method: 'DELETE',
        headers: cabeceras,
        signal: AbortSignal.timeout(PLAZO_MS),
      });
      if (!res.ok && !(await noExiste(res))) await fallo(res, 'borrar la foto');
    },
  };
}

/**
 * Storage avisa que el archivo no existe con un 404 o, según la versión, con un 400 que trae
 * `"statusCode": "404"` o `"error": "not_found"` en el cuerpo.
 */
async function noExiste(res: Response) {
  if (res.status === 404) return true;
  if (res.status !== 400) return false;
  const cuerpo = (await res
    .clone()
    .json()
    .catch(() => null)) as { statusCode?: string; error?: string } | null;
  return cuerpo?.statusCode === '404' || cuerpo?.error === 'not_found';
}

export const almacenFotos: AlmacenFotos =
  env.FOTOS_ALMACEN === 'supabase'
    ? almacenSupabase({
        url: env.SUPABASE_URL!,
        claveSecreta: env.SUPABASE_CLAVE_SECRETA!,
        bucket: env.SUPABASE_BUCKET,
      })
    : almacenDisco(env.FOTOS_DIR);
