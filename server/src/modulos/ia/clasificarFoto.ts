import sharp from 'sharp';
import { z } from 'zod';
import { normalizarFoto } from '../../compartido/analisisFoto.js';
import { ErrorApp } from '../../compartido/errores.js';
import { listarCategoriasActivas } from '../catalogo/repositorio.js';
import { IaNoDisponible, servicioIa } from './servicio.js';

// Lado mayor con el que se manda la foto. Más grande no mejora la clasificación y cuesta más tokens:
// la API achica igual las imágenes que lo superan.
const LADO_MAXIMO_PX = 1568;

/** Qué es cada severidad. También lo usa la verificación de la foto (verificarFoto.ts). */
export const CRITERIO_SEVERIDAD = `  - LEVE: molesta, pero se puede pasar con cuidado.
  - MODERADA: dificulta el paso o es riesgosa para algunas personas (por ejemplo, alguien en silla de ruedas o con bastón).
  - GRAVE: impide el paso o es peligrosa para cualquiera (riesgo de caída o de accidente).`;

/**
 * Fijas a propósito: van como system prompt y no cambian entre consultas. Las categorías, que sí pueden
 * cambiar, van aparte en el texto de cada consulta.
 */
const INSTRUCCIONES = `Clasificás fotos de problemas en la vía pública que cargan vecinos en SnapIt.

Mirá la foto y elegí:
- categoriaId: el id de la categoría de la lista que mejor describe el problema principal de la foto. Solo un id de la lista.
- severidad: qué tan grave es para quien camina por ahí.
${CRITERIO_SEVERIDAD}

Si dudás entre dos categorías, elegí la del problema más visible. Si dudás con la severidad, elegí la menor.`;

export const SEVERIDADES = ['LEVE', 'MODERADA', 'GRAVE'] as const;

/** Las categorías activas como las lee el modelo: una por renglón, con su id. */
export function listaDeCategorias(categorias: { id: number; nombre: string; descripcion: string | null }[]) {
  return categorias
    .map(
      (categoria) =>
        `- ${categoria.id}: ${categoria.nombre}${categoria.descripcion ? `. ${categoria.descripcion}` : ''}`,
    )
    .join('\n');
}

export interface Sugerencia {
  categoriaId: number;
  severidad: (typeof SEVERIDADES)[number];
  registroIaId: number;
}

/**
 * Deja la foto lista para el modelo: JPEG, girada según el EXIF y con el lado mayor en LADO_MAXIMO_PX.
 * Acepta lo mismo que un reporte (analisisFoto.ts): también la de un iPhone (HEIC). Null si no es una de esas.
 */
export async function prepararFoto(contenido: Buffer) {
  const normalizada = await normalizarFoto(contenido);
  if (!normalizada) return null;
  try {
    // Una foto incompleta se manda con lo que llegó, igual que el hash (analisisFoto.ts): si no, el
    // reporte la aceptaría pero la sugerencia no.
    return await sharp(normalizada, { failOn: 'none' })
      .rotate()
      .resize({ width: LADO_MAXIMO_PX, height: LADO_MAXIMO_PX, fit: 'inside', withoutEnlargement: true })
      // Un PNG con transparencia: el fondo transparente pasa a blanco.
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Le pide a la IA la categoría y la severidad de una foto (JPG, PNG, WebP o HEIC). La foto no se guarda: solo se usa para
 * la consulta. Si la IA no responde o responde algo inválido (por ejemplo, un id que no está en la lista),
 * lanza IaNoDisponible (503).
 */
export async function clasificarImagen(usuarioId: number, archivo: Buffer): Promise<Sugerencia> {
  const foto = await prepararFoto(archivo);
  if (!foto) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: 'foto', mensaje: 'Tiene que ser una foto JPG, PNG, WebP o HEIC' },
    ]);
  }

  const categorias = await listarCategoriasActivas();
  if (categorias.length === 0) throw new IaNoDisponible('No hay categorías activas para sugerir');
  const ids = categorias.map((categoria) => categoria.id);

  // Un id que no está en la lista hace fallar la validación: el intento queda en registro_ia como fallido.
  const esquema = z.object({
    categoriaId: z
      .number()
      .int()
      .refine((id) => ids.includes(id), { error: 'No es una de las categorías de la lista' }),
    severidad: z.enum(SEVERIDADES),
  });

  const { resultado, registroIaId } = await servicioIa.consultar({
    tipo: 'CLASIFICACION_IMAGEN',
    usuarioId,
    instrucciones: INSTRUCCIONES,
    texto: `Categorías (id: nombre. descripción):\n${listaDeCategorias(categorias)}`,
    imagenes: [{ contenido: foto, tipo: 'image/jpeg' }],
    esquema,
    // Elegir entre unas pocas opciones no necesita pensar mucho: más rápido y más barato.
    esfuerzo: 'low',
  });

  return { categoriaId: resultado.categoriaId, severidad: resultado.severidad, registroIaId };
}

/**
 * La sugerencia para el vecino que está cargando un reporte (F06): categoría y severidad de la foto que
 * acaba de sacar. Si la IA no está disponible responde 503 y el vecino elige a mano.
 */
export async function clasificarFoto(usuarioId: number, archivo: Buffer | undefined): Promise<Sugerencia> {
  if (!archivo) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: 'foto', mensaje: 'Es obligatoria' },
    ]);
  }
  return clasificarImagen(usuarioId, archivo);
}
