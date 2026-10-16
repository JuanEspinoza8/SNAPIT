import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Prisma, TipoIa } from '@prisma/client';
import { z } from 'zod';
import { ErrorApp } from '../../compartido/errores.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { registrarIntento } from './repositorio.js';

/**
 * La IA no pudo responder: falta la clave, la API falló o tardó demasiado, o la respuesta no sirve.
 * Llega al cliente como 503; el motivo real queda en registro_ia y en el log.
 */
export class IaNoDisponible extends ErrorApp {
  constructor(
    readonly motivo: string,
    opciones?: { cause?: unknown },
  ) {
    super(503, 'IA_NO_DISPONIBLE', 'La IA no está disponible en este momento');
    this.name = 'IaNoDisponible';
    this.cause = opciones?.cause;
  }
}

export interface ImagenIa {
  contenido: Buffer;
  tipo: 'image/jpeg' | 'image/png';
}

export interface ConsultaIa<T> {
  /** Para qué se usa: queda en registro_ia. */
  tipo: TipoIa;
  /** Quién la originó, si la pidió alguien. */
  usuarioId?: number | null;
  /** Qué tiene que hacer el modelo. Va como system prompt: conviene que no cambie entre llamadas. */
  instrucciones: string;
  /** Los datos de esta consulta. */
  texto: string;
  imagenes?: ImagenIa[];
  /** Forma de la respuesta. Se le exige a la API y se vuelve a validar al recibirla. */
  esquema: z.ZodType<T>;
  /** Cuánto piensa el modelo antes de responder. Si no se indica, el del modelo. */
  esfuerzo?: 'low' | 'medium' | 'high';
  /** Tope de tokens de la respuesta, contando lo que el modelo piensa antes de responder. */
  maxTokens?: number;
}

export interface RespuestaIa<T> {
  resultado: T;
  registroIaId: number;
}

export interface OpcionesIa {
  /** Sin clave, cada consulta falla con IaNoDisponible (y queda registrada). */
  apiKey: string | undefined;
  modelo: string;
  timeoutMs: number;
  /** Para los tests: un fetch simulado en lugar de la red. */
  fetch?: typeof fetch;
}

// Suficiente para una respuesta JSON corta más lo que piense el modelo antes.
const MAX_TOKENS_POR_DEFECTO = 4096;

/** Un problema con la respuesta, no con la conexión: el modelo contestó algo que no se puede usar. */
class RespuestaInvalida extends Error {
  constructor(
    mensaje: string,
    readonly salida: Prisma.InputJsonValue | null = null,
  ) {
    super(mensaje);
  }
}

export function crearServicioIa({ apiKey, modelo, timeoutMs, fetch }: OpcionesIa) {
  // Un solo reintento: con el valor por defecto del SDK (2) un vecino podría esperar el triple del timeout.
  const cliente = apiKey ? new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1, fetch }) : null;

  /**
   * Le pide al modelo una respuesta con la forma de `esquema` y la devuelve validada. Cada consulta
   * queda en registro_ia, salga bien o mal. Si no hay una respuesta usable, lanza IaNoDisponible.
   */
  async function consultar<T>(consulta: ConsultaIa<T>): Promise<RespuestaIa<T>> {
    const inicio = Date.now();
    const intento = {
      usuarioId: consulta.usuarioId ?? null,
      tipo: consulta.tipo,
      modelo,
      entrada: describirEntrada(consulta),
    };

    let resultado: T;
    let salida: Prisma.InputJsonValue | null;
    try {
      if (!cliente) throw new RespuestaInvalida('Falta ANTHROPIC_API_KEY en el .env');
      ({ resultado, salida, modelo: intento.modelo } = await pedir(cliente, consulta));
    } catch (error) {
      const motivo = motivoDelFallo(error, timeoutMs);
      logger.warn({ err: error, tipo: consulta.tipo }, 'La IA no respondió: %s', motivo);
      await registrarIntento({
        ...intento,
        salida: error instanceof RespuestaInvalida ? error.salida : null,
        duracionMs: Date.now() - inicio,
        exito: false,
        error: motivo,
      });
      throw new IaNoDisponible(motivo, { cause: error });
    }

    const registroIaId = await registrarIntento({
      ...intento,
      salida,
      duracionMs: Date.now() - inicio,
      exito: true,
      error: null,
    });
    return { resultado, registroIaId };
  }

  async function pedir<T>(cliente: Anthropic, consulta: ConsultaIa<T>) {
    const respuesta = await cliente.messages.create({
      model: modelo,
      max_tokens: consulta.maxTokens ?? MAX_TOKENS_POR_DEFECTO,
      system: consulta.instrucciones,
      // La API garantiza la estructura (campos, tipos y obligatorios). Las demás restricciones de zod
      // (valores de un enum, mínimos, máximos) el SDK las manda solo como descripción: por eso la
      // respuesta se vuelve a validar abajo. Se usa create y no parse para conservar la respuesta cruda
      // cuando no valida: parse la descarta y en registro_ia hace falta para entender qué pasó.
      output_config: {
        format: zodOutputFormat(consulta.esquema),
        ...(consulta.esfuerzo && { effort: consulta.esfuerzo }),
      },
      messages: [
        {
          role: 'user',
          content: [
            ...(consulta.imagenes ?? []).map((imagen) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: imagen.tipo,
                data: imagen.contenido.toString('base64'),
              },
            })),
            { type: 'text' as const, text: consulta.texto },
          ],
        },
      ],
    });

    // Las respuestas pueden empezar con bloques de razonamiento: la respuesta es el texto.
    const texto = respuesta.content
      .filter((bloque) => bloque.type === 'text')
      .map((bloque) => bloque.text)
      .join('');
    if (respuesta.stop_reason === 'refusal') {
      throw new RespuestaInvalida(
        `El modelo se negó a responder (${respuesta.stop_details?.category ?? 'sin categoría'})`,
      );
    }
    if (respuesta.stop_reason === 'max_tokens') {
      throw new RespuestaInvalida('La respuesta se cortó por max_tokens', texto || null);
    }

    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new RespuestaInvalida('La respuesta no es JSON', texto || null);
    }
    const validado = consulta.esquema.safeParse(json);
    if (!validado.success) {
      throw new RespuestaInvalida(
        `La respuesta no tiene la forma pedida:\n${z.prettifyError(validado.error)}`,
        json as Prisma.InputJsonValue,
      );
    }

    logger.debug({ tipo: consulta.tipo, uso: respuesta.usage }, 'Consulta a la IA');
    return { resultado: validado.data, salida: json as Prisma.InputJsonValue, modelo: respuesta.model };
  }

  return { consultar };
}

/** Lo que se le mandó al modelo, para registro_ia. Las imágenes van descriptas, no en base64. */
function describirEntrada(consulta: ConsultaIa<unknown>) {
  const imagenes = (consulta.imagenes ?? []).map(
    (imagen) => `[imagen ${imagen.tipo}, ${imagen.contenido.length} bytes]`,
  );
  return [consulta.instrucciones, '---', ...imagenes, consulta.texto].join('\n');
}

/** Un motivo legible para registro_ia y el log. Va del caso más específico al más general. */
function motivoDelFallo(error: unknown, timeoutMs: number) {
  if (error instanceof RespuestaInvalida) return error.message;
  if (error instanceof Anthropic.AuthenticationError) return 'La API rechazó la clave (401)';
  if (error instanceof Anthropic.RateLimitError) return 'Se superó el límite de uso de la API (429)';
  if (error instanceof Anthropic.APIConnectionTimeoutError) return `La API tardó más de ${timeoutMs} ms`;
  if (error instanceof Anthropic.APIConnectionError) return 'No se pudo conectar con la API';
  if (error instanceof Anthropic.APIError)
    return `La API respondió con error ${error.status}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

/** El servicio que usa el sistema, configurado con el .env. */
export const servicioIa = crearServicioIa({
  apiKey: env.ANTHROPIC_API_KEY,
  modelo: env.IA_MODELO,
  timeoutMs: env.IA_TIMEOUT_MS,
});
