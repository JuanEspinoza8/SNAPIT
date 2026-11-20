import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { analizarFoto } from '../compartido/analisisFoto.js';
import { prisma } from '../compartido/prisma.js';
import { crearReporte } from '../modulos/reportes/servicio.js';
import { USUARIOS_PRUEBA } from './datos.js';

/**
 * Cada reporte de la demo: la foto (dentro de la carpeta), qué eligió el vecino y, si se quiere, quién y dónde.
 * Sin punto se usa el que trae la foto en su EXIF, como hacen la web y la app; si tampoco trae, uno de Neuquén.
 */
const esquemaManifiesto = z.array(
  z.object({
    foto: z.string().min(1),
    categoria: z.string().min(1),
    gravedad: z.enum(['LEVE', 'MODERADA', 'GRAVE']),
    descripcion: z.string().max(1000).optional(),
    vecino: z.email().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
  }),
);

export type ReporteDemo = z.infer<typeof esquemaManifiesto>[number];

// Centro de Neuquén: los reportes sin ubicación se reparten alrededor, uno por cuadra, para que no se agrupen.
const CENTRO = { lat: -38.9516, lon: -68.0591 };
const CUADRA_GRADOS = 0.0012;

/**
 * Carga como reportes de vecinos las fotos de una carpeta, según su `demo.json`: sirve para preparar la
 * exposición con casos variados (una foto en el lugar, una sin GPS del mismo problema, una mascota, una categoría
 * equivocada) y procesarlos con la IA en vivo. Los reportes entran como cualquier otro: pendientes, con sus
 * controles y agrupados. Devuelve qué pasó con cada uno.
 */
export async function cargarDemo(carpeta: string) {
  const manifiesto = esquemaManifiesto.parse(
    JSON.parse(await readFile(path.join(carpeta, 'demo.json'), 'utf8')),
  );
  const categorias = await prisma.categoria.findMany({
    where: { activa: true },
    select: { id: true, nombre: true },
  });
  const vecinosDeLaSemilla = USUARIOS_PRUEBA.filter((u) => u.rol === 'VECINO').map((u) => u.email);

  const resultados = [];
  for (const [indice, reporte] of manifiesto.entries()) {
    const categoria = categorias.find((c) => c.nombre.toLowerCase() === reporte.categoria.toLowerCase());
    if (!categoria) {
      throw new Error(
        `${reporte.foto}: no existe la categoría «${reporte.categoria}». Hay: ${categorias.map((c) => c.nombre).join(', ')}`,
      );
    }
    const email = reporte.vecino ?? vecinosDeLaSemilla[indice % vecinosDeLaSemilla.length]!;
    const vecino = await prisma.usuario.findFirst({ where: { email, rol: 'VECINO', eliminadoEn: null } });
    if (!vecino) throw new Error(`${reporte.foto}: no existe el vecino ${email}. ¿Corriste npm run semilla?`);

    const foto = await readFile(path.join(carpeta, reporte.foto));
    const punto = await puntoDe(reporte, foto, indice);
    const creado = await crearReporte(
      vecino.id,
      {
        categoriaId: String(categoria.id),
        severidadDeclarada: reporte.gravedad,
        descripcion: reporte.descripcion,
        lat: String(punto.lat),
        lon: String(punto.lon),
        origen: 'APP_MOVIL',
      },
      foto,
    );
    resultados.push({ foto: reporte.foto, vecino: email, punto: punto.de, ...creado });
  }
  return resultados;
}

async function puntoDe(reporte: ReporteDemo, foto: Buffer, indice: number) {
  if (reporte.lat !== undefined && reporte.lon !== undefined) {
    return { lat: reporte.lat, lon: reporte.lon, de: 'demo.json' };
  }
  const { latitud, longitud } = (await analizarFoto(foto))?.exif ?? { latitud: null, longitud: null };
  if (latitud !== null && longitud !== null) return { lat: latitud, lon: longitud, de: 'la foto' };
  return { lat: CENTRO.lat - indice * CUADRA_GRADOS, lon: CENTRO.lon, de: 'el centro de Neuquén' };
}
