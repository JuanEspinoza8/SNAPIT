import os from 'node:os';
import path from 'node:path';
import { config } from 'dotenv';
import { configDefaults, defineConfig } from 'vitest/config';

config({ path: path.resolve(import.meta.dirname, '../.env'), quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Falta TEST_DATABASE_URL en el .env');
}

/**
 * Cada archivo de tests corre en paralelo con su propio cliente de Prisma, y cada cliente abre por defecto hasta
 * (núcleos × 2 + 1) conexiones: en una PC con muchos núcleos se pasa del máximo de PostgreSQL (100) y los tests
 * fallan al azar con «too many clients already». Con un tope por cliente alcanza para todos. Si la URL ya trae
 * uno, se respeta.
 */
function conTopeDeConexiones(url: string) {
  if (url.includes('connection_limit=')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=5`;
}

// Crear un perfil o una categoría agrega filas a la matriz de todas las categorías o perfiles, también las de
// otros tests que las están borrando: corre sola, después de los generales.
const CATALOGO = 'test/admin-catalogo.test.ts';
const SEMILLA = 'test/semilla.test.ts';
const RED = 'test/importar-red.test.ts';
const VINCULOS = 'test/vinculos.test.ts';
const RECORRIDOS = 'test/recorridos.test.ts';

export default defineConfig({
  test: {
    // Los tests siempre corren contra la base de pruebas, nunca contra la de desarrollo.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: conTopeDeConexiones(process.env.TEST_DATABASE_URL),
      // Las fotos de los tests van a una carpeta temporal, no a la de desarrollo ni a Supabase, aunque el
      // .env apunte ahí.
      FOTOS_ALMACEN: 'disco',
      FOTOS_DIR: path.join(os.tmpdir(), 'snapit-fotos-test'),
      SUPABASE_URL: '',
      SUPABASE_CLAVE_SECRETA: '',
      // Los tests ingresan con la clave de prueba del repo.
      CLAVE_USUARIOS_DEMO: '',
      // Chico, para probar el límite sin mandar archivos enormes.
      FOTO_MAX_MB: '1',
      // Muchos tests cambian un parámetro en la base y lo leen enseguida: sin caché lo ven al instante.
      PARAMETROS_CACHE_MS: '0',
      // Los tests simulan Nominatim. Si alguno se olvida, falla contra esta dirección local y no le
      // pega al servicio público.
      NOMINATIM_URL: 'http://127.0.0.1:9',
      // Los tests simulan la API de Claude: sin clave y con una dirección local, aunque el .env tenga una
      // clave real, ningún test hace una llamada que se cobre.
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
      // Los tests simulan FCM. Sin credenciales, aunque el .env tenga unas, ningún test manda un aviso real.
      FIREBASE_CREDENCIALES: '',
    },
    globalSetup: './test/prepararBase.ts',
    // El primer test de cada archivo abre la conexión a la base: en una PC lenta o en CI pasa los 5 s por defecto.
    testTimeout: 15_000,
    // La semilla vuelve a cargar el catálogo y los parámetros que usan los demás tests: corre sola, al final,
    // para no cambiarles un valor mientras corren en paralelo. La importación de la red y los vínculos con los
    // incidentes y los recorridos reemplazan toda la red de la base: corren solos, después, uno detrás del otro.
    projects: [
      {
        extends: true,
        test: {
          name: 'general',
          exclude: [...configDefaults.exclude, CATALOGO, SEMILLA, RED, VINCULOS, RECORRIDOS],
          sequence: { groupOrder: 0 },
        },
      },
      { extends: true, test: { name: 'catalogo', include: [CATALOGO], sequence: { groupOrder: 1 } } },
      { extends: true, test: { name: 'semilla', include: [SEMILLA], sequence: { groupOrder: 2 } } },
      { extends: true, test: { name: 'red', include: [RED], sequence: { groupOrder: 3 } } },
      { extends: true, test: { name: 'vinculos', include: [VINCULOS], sequence: { groupOrder: 4 } } },
      { extends: true, test: { name: 'recorridos', include: [RECORRIDOS], sequence: { groupOrder: 5 } } },
    ],
  },
});
