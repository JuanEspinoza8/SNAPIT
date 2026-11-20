import { z } from 'zod';
import { listarCategoriasActivas } from '../catalogo/repositorio.js';
import type { AnalisisFoto } from '../verificacion/calculo.js';
import { CRITERIO_SEVERIDAD, listaDeCategorias, prepararFoto, SEVERIDADES } from './clasificarFoto.js';
import { IaNoDisponible, servicioIa } from './servicio.js';

/**
 * Fijas a propósito: van como system prompt. Las categorías y si hay foto de referencia van en el texto de cada
 * consulta. A la IA no se le dice qué eligió el vecino: así no se deja llevar, y la comparación la hace el
 * servidor (verificacion/calculo.ts).
 */
const INSTRUCCIONES = `Verificás las fotos de los reportes que cargan vecinos en SnapIt, una app para avisar de problemas en la vía pública. Un operador del municipio lee tu respuesta.

Recibís la foto del reporte y, a veces, una foto de referencia: la de otro reporte, ya verificado, del mismo lugar.

Respondé:
- esProblemaViaPublica: true si la foto muestra un problema en el espacio público (calzada, vereda, cordón, alumbrado, una obra). false si muestra otra cosa: una mascota, una persona posando, un interior, una captura de pantalla, un meme, un dibujo o algo sin relación con la calle. Si es una foto de la calle pero dudás de que haya un problema, true: la revisa una persona.
- categoriaId: el id de la categoría de la lista que mejor describe el problema principal. Solo un id de la lista. null si esProblemaViaPublica es false.
- severidad: qué tan grave es para quien camina por ahí. null si esProblemaViaPublica es false.
${CRITERIO_SEVERIDAD}
- mismoProblema: solo si hay foto de referencia. true si las dos fotos muestran el mismo problema en el mismo lugar (el mismo pozo, la misma vereda, el mismo poste), aunque estén sacadas desde otro ángulo o con otra luz. false si no. null si no hay foto de referencia.
- datosPersonales: true si se ve una cara reconocible o una patente legible.
- explicacion: una o dos oraciones en castellano para el operador: qué se ve en la foto que justifica tu respuesta.

Si dudás entre dos categorías, elegí la del problema más visible. Si dudás con la severidad, elegí la menor.`;

export interface Verificacion extends AnalisisFoto {
  explicacion: string;
  registroIaId: number;
  /** Tokens que usó la consulta (servicioIa). */
  uso: { entrada: number; salida: number };
}

/**
 * Le pide a la IA que mire la foto de un reporte pendiente (F04): si muestra un problema de la vía pública, cuál,
 * si es el mismo que la foto de referencia y si se ven datos personales. Con referencia se le pide un poco más
 * de esfuerzo, porque comparar dos fotos es más difícil que clasificar una. Si la IA no responde o responde algo
 * inválido, lanza IaNoDisponible.
 */
export async function verificarFoto(
  usuarioId: number,
  foto: Buffer,
  referencia: Buffer | null,
): Promise<Verificacion> {
  const [preparada, referenciaPreparada] = await Promise.all([
    prepararFoto(foto),
    referencia ? prepararFoto(referencia) : null,
  ]);
  if (!preparada) throw new IaNoDisponible('La foto del reporte no es una imagen que se pueda leer');

  const categorias = await listarCategoriasActivas();
  if (categorias.length === 0) throw new IaNoDisponible('No hay categorías activas');
  const ids = categorias.map((categoria) => categoria.id);
  const hayReferencia = referenciaPreparada !== null;

  // Lo que no se puede pedir en el esquema de la API (valores de la lista, coherencia entre campos) se valida
  // al recibir la respuesta: una respuesta que no cumple queda en registro_ia como fallida.
  const esquema = z
    .object({
      esProblemaViaPublica: z.boolean(),
      categoriaId: z.number().int().nullable(),
      severidad: z.enum(SEVERIDADES).nullable(),
      mismoProblema: z.boolean().nullable(),
      datosPersonales: z.boolean(),
      explicacion: z.string().min(1).max(600),
    })
    .refine((r) => r.categoriaId === null || ids.includes(r.categoriaId), {
      error: 'No es una de las categorías de la lista',
      path: ['categoriaId'],
    })
    .refine((r) => !r.esProblemaViaPublica || (r.categoriaId !== null && r.severidad !== null), {
      error: 'Si es un problema de la vía pública, hacen falta la categoría y la severidad',
      path: ['categoriaId'],
    });

  const texto = [
    `Categorías (id: nombre. descripción):\n${listaDeCategorias(categorias)}`,
    hayReferencia
      ? 'La primera imagen es la foto del reporte. La segunda es la foto de referencia, de un reporte ya verificado del mismo lugar.'
      : 'No hay foto de referencia: mismoProblema va en null.',
  ].join('\n\n');

  const { resultado, registroIaId, uso } = await servicioIa.consultar({
    tipo: 'CLASIFICACION_IMAGEN',
    usuarioId,
    instrucciones: INSTRUCCIONES,
    texto,
    imagenes: [
      { contenido: preparada, tipo: 'image/jpeg' },
      ...(referenciaPreparada ? [{ contenido: referenciaPreparada, tipo: 'image/jpeg' as const }] : []),
    ],
    esquema,
    esfuerzo: hayReferencia ? 'medium' : 'low',
  });

  return {
    esProblemaViaPublica: resultado.esProblemaViaPublica,
    // Si no es un problema de la vía pública, la categoría y la severidad no significan nada.
    categoriaId: resultado.esProblemaViaPublica ? resultado.categoriaId : null,
    severidad: resultado.esProblemaViaPublica ? resultado.severidad : null,
    mismoProblema: hayReferencia ? resultado.mismoProblema : null,
    datosPersonales: resultado.datosPersonales,
    explicacion: resultado.explicacion,
    registroIaId,
    uso,
  };
}
