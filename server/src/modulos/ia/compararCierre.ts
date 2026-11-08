import { z } from 'zod';
import { ErrorApp } from '../../compartido/errores.js';
import { prepararFoto } from './clasificarFoto.js';
import { servicioIa } from './servicio.js';

// Fijas a propósito: van como system prompt y no cambian entre consultas.
const INSTRUCCIONES = `Comparás dos momentos de un mismo problema en la vía pública: las fotos del antes (cuando se reportó) y la foto del después (cuando el área dice que lo resolvió).

Decidí:
- veredicto:
  - RESUELTO: en la foto del después el problema ya no está; el lugar quedó en condiciones.
  - NO_RESUELTO: el problema sigue igual o peor.
  - NO_CONCLUYENTE: las fotos no permiten saberlo (no muestran el mismo lugar, están borrosas o no se ve el problema).
- explicacion: en una o dos oraciones, qué ves en las fotos que justifica el veredicto.

Si dudás entre RESUELTO y NO_RESUELTO, elegí NO_CONCLUYENTE.`;

const VEREDICTOS = ['RESUELTO', 'NO_RESUELTO', 'NO_CONCLUYENTE'] as const;

// Un incidente con muchos reportes tiene muchas fotos: con unas pocas alcanza para ver el problema, y cada
// imagen suma tokens y tiempo. Van las primeras, las de los reportes que lo originaron.
export const MAX_FOTOS_ANTES = 4;

export interface ComparacionCierre {
  veredicto: (typeof VEREDICTOS)[number];
  explicacion: string;
  registroIaId: number;
}

/**
 * Compara las fotos del antes con la del después (F09) y devuelve el veredicto de la IA. El intento queda en
 * registro_ia (servicioIa.consultar). Si la IA no responde o responde algo inválido, lanza IaNoDisponible (503).
 * Del antes se mandan como mucho MAX_FOTOS_ANTES, en el orden recibido.
 */
export async function compararCierre(
  usuarioId: number,
  fotosAntes: Buffer[],
  fotoDespues: Buffer,
): Promise<ComparacionCierre> {
  if (fotosAntes.length === 0) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: 'fotosAntes', mensaje: 'Hace falta al menos una foto del antes' },
    ]);
  }

  const despues = await prepararFoto(fotoDespues);
  if (despues === null) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: 'foto', mensaje: 'Tiene que ser una imagen JPG o PNG' },
    ]);
  }

  const preparadas = await Promise.all(fotosAntes.slice(0, MAX_FOTOS_ANTES).map(prepararFoto));
  if (preparadas.some((foto) => foto === null)) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Hay datos inválidos', [
      { campo: 'fotosAntes', mensaje: 'Tienen que ser imágenes JPG o PNG' },
    ]);
  }
  const antes = preparadas.filter((foto): foto is NonNullable<typeof foto> => foto !== null);

  const esquema = z.object({
    veredicto: z.enum(VEREDICTOS),
    explicacion: z.string().min(1).max(600),
  });

  const { resultado, registroIaId } = await servicioIa.consultar({
    tipo: 'COMPARACION_CIERRE',
    usuarioId,
    instrucciones: INSTRUCCIONES,
    texto: `Las primeras ${antes.length} ${antes.length === 1 ? 'imagen es el antes' : 'imágenes son el antes'}; la última es el después.`,
    imagenes: [
      ...antes.map((foto) => ({ contenido: foto, tipo: 'image/jpeg' as const })),
      { contenido: despues, tipo: 'image/jpeg' as const },
    ],
    esquema,
    // Comparar dos fotos no necesita pensar mucho: más rápido y más barato.
    esfuerzo: 'low',
  });

  return {
    veredicto: resultado.veredicto,
    explicacion: resultado.explicacion,
    registroIaId,
  };
}
