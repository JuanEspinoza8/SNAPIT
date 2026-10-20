import sharp from 'sharp';
import { z } from 'zod';
import { ErrorApp } from '../../compartido/errores.js';
import { listarCategoriasActivas } from '../catalogo/repositorio.js';
import { IaNoDisponible, servicioIa } from './servicio.js';

// Lado mayor con el que se manda la foto. Más grande no mejora la clasificación y cuesta más tokens:
// la API achica igual las imágenes que lo superan.
const LADO_MAXIMO_PX = 1568;

/**
 * Fijas a propósito: van como system prompt y no cambian entre consultas. Las categorías, que sí pueden
 * cambiar, van aparte en el texto de cada consulta.
 */
const INSTRUCCIONES = `Clasificás fotos de problemas en la vía pública que cargan vecinos en SnapIt.

Mirá la foto y elegí:
- categoriaId: el id de la categoría de la lista que mejor describe el problema principal de la foto. Solo un id de la lista.
- severidad: qué tan grave es para quien camina por ahí.
  - LEVE: molesta, pero se puede pasar con cuidado.
  - MODERADA: dificulta el paso o es riesgosa para algunas personas (por ejemplo, alguien en silla de ruedas o con bastón).
  - GRAVE: impide el paso o es peligrosa para cualquiera (riesgo de caída o de accidente).

Si dudás entre dos categorías, elegí la del problema más visible. Si dudás con la severidad, elegí la menor.`;

const SEVERIDADES = ['LEVE', 'MODERADA', 'GRAVE'] as const;

export interface Sugerencia {
  categoriaId: number;
  severidad: (typeof SEVERIDADES)[number];
  registroIaId: number;
}

/**
 * Deja la foto lista para el modelo: JPEG, girada según el EXIF y con el lado mayor en LADO_MAXIMO_PX.
 * Devuelve null si no es una imagen JPG o PNG.
 */
async function prepararFoto(contenido: Buffer) {
  try {
    const { format } = await sharp(contenido).metadata();
    if (format !== 'jpeg' && format !== 'png') return null;
    // Una foto incompleta se manda con lo que llegó, igual que el hash (analisisFoto.ts): si no, el
    // reporte la aceptaría pero la sugerencia no.
    return await sharp(contenido, { failOn: 'none' })
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
 * Lo que se le agrega a las instrucciones cuando se pide la explicación (cola de verificación, ia/cola.ts): el
 * operador la lee en el log para entender la propuesta.
 */
const PEDIR_EXPLICACION = `

- explicacion: en una o dos oraciones, qué ves en la foto que justifica la categoría y la severidad.`;

export interface Clasificacion extends Sugerencia {
  /** Por qué propuso eso. Null si no se pidió. */
  explicacion: string | null;
  /** Tokens que usó la consulta (servicioIa). */
  uso: { entrada: number; salida: number };
}

/**
 * Le pide a la IA la categoría y la severidad de una foto (JPG o PNG). Con `conExplicacion`, también por qué.
 * La foto no se guarda: solo se usa para la consulta. Si la IA no responde o responde algo inválido (por
 * ejemplo, un id que no está en la lista), lanza IaNoDisponible (503).
 */
export async function clasificarImagen(
  usuarioId: number,
  archivo: Buffer,
  { conExplicacion = false }: { conExplicacion?: boolean } = {},
): Promise<Clasificacion> {
  const foto = await prepararFoto(archivo);
  if (!foto) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: 'foto', mensaje: 'Tiene que ser una imagen JPG o PNG' },
    ]);
  }

  const categorias = await listarCategoriasActivas();
  if (categorias.length === 0) throw new IaNoDisponible('No hay categorías activas para sugerir');
  const ids = categorias.map((categoria) => categoria.id);

  // Un id que no está en la lista hace fallar la validación: el intento queda en registro_ia como fallido.
  const base = z.object({
    categoriaId: z
      .number()
      .int()
      .refine((id) => ids.includes(id), { error: 'No es una de las categorías de la lista' }),
    severidad: z.enum(SEVERIDADES),
  });
  const esquema = conExplicacion ? base.extend({ explicacion: z.string().min(1).max(600) }) : base;

  const lista = categorias
    .map(
      (categoria) =>
        `- ${categoria.id}: ${categoria.nombre}${categoria.descripcion ? `. ${categoria.descripcion}` : ''}`,
    )
    .join('\n');

  const { resultado, registroIaId, uso } = await servicioIa.consultar({
    tipo: 'CLASIFICACION_IMAGEN',
    usuarioId,
    instrucciones: conExplicacion ? INSTRUCCIONES + PEDIR_EXPLICACION : INSTRUCCIONES,
    texto: `Categorías (id: nombre. descripción):\n${lista}`,
    imagenes: [{ contenido: foto, tipo: 'image/jpeg' }],
    esquema: esquema as z.ZodType<z.infer<typeof base> & { explicacion?: string }>,
    // Elegir entre unas pocas opciones no necesita pensar mucho: más rápido y más barato.
    esfuerzo: 'low',
  });

  return {
    categoriaId: resultado.categoriaId,
    severidad: resultado.severidad,
    registroIaId,
    explicacion: resultado.explicacion ?? null,
    uso,
  };
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
  const { categoriaId, severidad, registroIaId } = await clasificarImagen(usuarioId, archivo);
  return { categoriaId, severidad, registroIaId };
}
