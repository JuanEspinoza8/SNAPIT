import type { Usuario } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ErrorApp } from '../src/compartido/errores.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearServicioIa, IaNoDisponible, type ConsultaIa } from '../src/modulos/ia/servicio.js';
import { crearUsuario } from './apoyo.js';
import { jpegConExif } from './imagenes.js';

// La API de Claude simulada: ningún test sale a la red ni gasta.
const fetchSimulado = vi.fn<typeof fetch>();

const servicio = (opciones: { apiKey?: string; timeoutMs?: number } = {}) =>
  crearServicioIa({
    apiKey: 'apiKey' in opciones ? opciones.apiKey : 'clave-de-prueba',
    modelo: 'claude-haiku-5-5',
    timeoutMs: opciones.timeoutMs ?? 5_000,
    fetch: fetchSimulado,
  });

/** Una respuesta de la API de mensajes con estos bloques de contenido. */
function mensaje(contenido: unknown[], extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: 'msg_prueba',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: contenido,
      stop_reason: 'end_turn',
      stop_details: null,
      usage: { input_tokens: 1500, output_tokens: 40 },
      ...extra,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const responderTexto = (texto: string, extra?: Record<string, unknown>) =>
  mensaje([{ type: 'text', text: texto }], extra);

/** Un error de la API, sin espera antes del reintento. */
function errorApi(status: number, tipo: string) {
  return new Response(JSON.stringify({ type: 'error', error: { type: tipo, message: 'Error simulado' } }), {
    status,
    // Con 0 el SDK ignora el encabezado y espera su pausa por defecto (casi medio segundo).
    headers: { 'Content-Type': 'application/json', 'retry-after-ms': '1' },
  });
}

/** Un pedido que nunca responde: solo termina cuando se corta la espera. */
const nuncaResponde: typeof fetch = (_url, opciones) =>
  new Promise((_resolver, rechazar) => {
    opciones?.signal?.addEventListener('abort', () => rechazar(opciones.signal!.reason));
  });

/** Lo que mandó el servidor a la API en la llamada número `n`. */
function pedidoEnviado(n = 0) {
  const [url, opciones] = fetchSimulado.mock.calls[n]!;
  return { url: String(url), cuerpo: JSON.parse(String(opciones?.body)), headers: opciones?.headers };
}

const esquema = z.object({ categoria: z.enum(['POZO', 'VEREDA']), confianza: z.number().min(0).max(1) });

let usuario: Usuario;

const consulta = (
  extra: Partial<ConsultaIa<z.infer<typeof esquema>>> = {},
): ConsultaIa<z.infer<typeof esquema>> => ({
  tipo: 'CLASIFICACION_IMAGEN',
  usuarioId: usuario.id,
  instrucciones: 'Clasificá el problema de la foto.',
  texto: 'Categorías: POZO, VEREDA.',
  esquema,
  ...extra,
});

/** Las filas de registro_ia de este usuario, de la más vieja a la más nueva. */
const registros = () =>
  prisma.registroIa.findMany({ where: { usuarioId: usuario.id }, orderBy: { id: 'asc' } });

beforeAll(async () => {
  usuario = await crearUsuario();
});

beforeEach(async () => {
  fetchSimulado.mockReset();
  await prisma.registroIa.deleteMany({ where: { usuarioId: usuario.id } });
});

afterAll(async () => {
  await prisma.registroIa.deleteMany({ where: { usuarioId: usuario.id } });
  await prisma.usuario.delete({ where: { id: usuario.id } });
});

describe('servicio de IA', () => {
  it('devuelve la respuesta validada y registra el intento', async () => {
    fetchSimulado.mockResolvedValueOnce(responderTexto('{"categoria":"POZO","confianza":0.9}'));

    const { resultado, registroIaId } = await servicio().consultar(consulta());

    expect(resultado).toEqual({ categoria: 'POZO', confianza: 0.9 });
    const [registro] = await registros();
    expect(registro).toMatchObject({
      id: registroIaId,
      usuarioId: usuario.id,
      tipo: 'CLASIFICACION_IMAGEN',
      proveedor: 'ANTHROPIC',
      modelo: 'claude-haiku-5-5',
      salida: { categoria: 'POZO', confianza: 0.9 },
      exito: true,
      error: null,
    });
    expect(registro!.duracionMs).toBeGreaterThanOrEqual(0);
  });

  it('manda el modelo, las instrucciones, la foto en base64 y el esquema de la respuesta', async () => {
    fetchSimulado.mockResolvedValueOnce(responderTexto('{"categoria":"POZO","confianza":0.9}'));
    const foto = jpegConExif();

    await servicio().consultar(
      consulta({ imagenes: [{ contenido: foto, tipo: 'image/jpeg' }], esfuerzo: 'low', maxTokens: 2000 }),
    );

    const { url, cuerpo, headers } = pedidoEnviado();
    expect(url).toMatch(/\/v1\/messages$/);
    expect(new Headers(headers).get('x-api-key')).toBe('clave-de-prueba');
    expect(cuerpo).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 2000,
      system: 'Clasificá el problema de la foto.',
      output_config: { effort: 'low', format: { type: 'json_schema' } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: foto.toString('base64') },
            },
            { type: 'text', text: 'Categorías: POZO, VEREDA.' },
          ],
        },
      ],
    });
    // La estructura viaja como esquema; las opciones válidas, como descripción (ver servicio.ts).
    expect(cuerpo.output_config.format.schema).toMatchObject({
      type: 'object',
      required: ['categoria', 'confianza'],
      additionalProperties: false,
    });
    expect(cuerpo.output_config.format.schema.properties.categoria.description).toContain('POZO');
  });

  it('en registro_ia la foto queda descripta, no en base64', async () => {
    fetchSimulado.mockResolvedValueOnce(responderTexto('{"categoria":"POZO","confianza":0.9}'));
    const foto = jpegConExif();

    await servicio().consultar(consulta({ imagenes: [{ contenido: foto, tipo: 'image/jpeg' }] }));

    const [registro] = await registros();
    expect(registro!.entrada).toContain('Clasificá el problema de la foto.');
    expect(registro!.entrada).toContain(`[imagen image/jpeg, ${foto.length} bytes]`);
    expect(registro!.entrada!.length).toBeLessThan(500);
  });

  it('ignora los bloques de razonamiento que vienen antes de la respuesta', async () => {
    fetchSimulado.mockResolvedValueOnce(
      mensaje([
        { type: 'thinking', thinking: '', signature: 'firma' },
        { type: 'text', text: '{"categoria":"VEREDA","confianza":0.6}' },
      ]),
    );

    const { resultado } = await servicio().consultar(consulta());

    expect(resultado).toEqual({ categoria: 'VEREDA', confianza: 0.6 });
  });

  describe('falla con IaNoDisponible y registra el intento', () => {
    async function fallaCon(motivo: string | RegExp, opciones?: { apiKey?: string; timeoutMs?: number }) {
      const error = await servicio(opciones)
        .consultar(consulta())
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(IaNoDisponible);
      expect((error as IaNoDisponible).motivo).toMatch(motivo);
      const filas = await registros();
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ proveedor: 'ANTHROPIC', exito: false });
      expect(filas[0]!.error).toMatch(motivo);
      return filas[0]!;
    }

    it('si falta la clave, sin llamar a la API', async () => {
      await fallaCon('Falta ANTHROPIC_API_KEY', { apiKey: undefined });
      expect(fetchSimulado).not.toHaveBeenCalled();
    });

    it('si la respuesta no es JSON, y guarda el texto que llegó', async () => {
      fetchSimulado.mockResolvedValueOnce(responderTexto('Es un pozo.'));

      const registro = await fallaCon('La respuesta no es JSON');
      expect(registro.salida).toBe('Es un pozo.');
    });

    it('si el JSON no tiene la forma pedida, y lo guarda', async () => {
      fetchSimulado.mockResolvedValueOnce(responderTexto('{"categoria":"BACHE","confianza":2}'));

      const registro = await fallaCon(/no tiene la forma pedida/);
      expect(registro.salida).toEqual({ categoria: 'BACHE', confianza: 2 });
    });

    it('si el modelo se niega a responder', async () => {
      fetchSimulado.mockResolvedValueOnce(
        mensaje([], {
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: null, explanation: null },
        }),
      );

      await fallaCon(/se negó a responder/);
    });

    it('si la respuesta se corta por max_tokens', async () => {
      fetchSimulado.mockResolvedValueOnce(responderTexto('{"categoria":"PO', { stop_reason: 'max_tokens' }));

      await fallaCon(/max_tokens/);
    });

    it('si la API rechaza la clave, sin reintentar', async () => {
      fetchSimulado.mockResolvedValue(errorApi(401, 'authentication_error'));

      await fallaCon(/rechazó la clave/);
      expect(fetchSimulado).toHaveBeenCalledTimes(1);
    });

    it('si la API está saturada, después de un reintento', async () => {
      fetchSimulado.mockImplementation(async () => errorApi(429, 'rate_limit_error'));

      await fallaCon(/límite de uso/);
      expect(fetchSimulado).toHaveBeenCalledTimes(2);
    });

    it('si la API tarda más que el timeout, sin reintentar', async () => {
      fetchSimulado.mockImplementation(nuncaResponde);

      const registro = await fallaCon(/tardó más de 50 ms/, { timeoutMs: 50 });
      // Sin el plazo total, el SDK esperaría otros 50 ms más la pausa entre intentos.
      expect(fetchSimulado).toHaveBeenCalledTimes(1);
      expect(registro.duracionMs).toBeLessThan(300);
    });

    it('si el reintento no termina dentro del plazo de la consulta', async () => {
      // El primero tarda 300 ms en fallar y el segundo nunca responde: el plazo de 400 ms es para los dos.
      fetchSimulado
        .mockImplementationOnce(async () => {
          await new Promise((listo) => setTimeout(listo, 300));
          return errorApi(529, 'overloaded_error');
        })
        .mockImplementation(nuncaResponde);

      const registro = await fallaCon(/tardó más de 400 ms/, { timeoutMs: 400 });
      expect(fetchSimulado).toHaveBeenCalledTimes(2);
      expect(registro.duracionMs).toBeLessThan(600);
    });
  });

  it('si no se puede registrar el fallo, igual lanza IaNoDisponible', async () => {
    // Un usuario que no existe hace fallar el insert en registro_ia por la clave foránea.
    const error = await servicio({ apiKey: undefined })
      .consultar(consulta({ usuarioId: 999_999_999 }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IaNoDisponible);
  });

  it('un reintento que sale bien cuenta como un solo intento exitoso', async () => {
    fetchSimulado
      .mockResolvedValueOnce(errorApi(529, 'overloaded_error'))
      .mockResolvedValueOnce(responderTexto('{"categoria":"POZO","confianza":0.9}'));

    const { resultado } = await servicio().consultar(consulta());

    expect(resultado.categoria).toBe('POZO');
    expect(await registros()).toEqual([expect.objectContaining({ exito: true })]);
  });

  it('IaNoDisponible llega al cliente como 503 sin mostrar el motivo interno', () => {
    const error = new IaNoDisponible('La API rechazó la clave (401)');

    expect(error).toBeInstanceOf(ErrorApp);
    expect(error).toMatchObject({ status: 503, codigo: 'IA_NO_DISPONIBLE' });
    expect(error.message).not.toContain('401');
  });
});
