import type { Usuario } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/compartido/prisma.js';
import { compararCierre } from '../src/modulos/ia/compararCierre.js';
import { crearServicioIa, IaNoDisponible, servicioIa } from '../src/modulos/ia/servicio.js';
import { crearUsuario } from './apoyo.js';
import { jpegConExif, png1x1 } from './imagenes.js';

// La API de Claude simulada: ningún test sale a la red ni gasta.
const fetchSimulado = vi.fn<typeof fetch>();
const servicioSimulado = () =>
  crearServicioIa({
    apiKey: 'clave-de-prueba',
    modelo: 'claude-haiku-5-5',
    timeoutMs: 5_000,
    fetch: fetchSimulado,
  });

/** La API responde este JSON como texto. */
const responder = (json: unknown) =>
  new Response(
    JSON.stringify({
      id: 'msg_prueba',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text: JSON.stringify(json) }],
      stop_reason: 'end_turn',
      stop_details: null,
      usage: { input_tokens: 1500, output_tokens: 30 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

/** Lo que el servidor le mandó a la API en el primer pedido. */
const pedidoEnviado = () => JSON.parse(String(fetchSimulado.mock.calls[0]![1]?.body));

let operador: Usuario;

beforeEach(async () => {
  operador = await crearUsuario({ rol: 'OPERADOR' });
  fetchSimulado.mockReset();
  vi.spyOn(servicioIa, 'consultar').mockImplementation(servicioSimulado().consultar);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.registroIa.deleteMany({ where: { usuarioId: operador.id } });
  await prisma.usuario.delete({ where: { id: operador.id } });
});

describe('compararCierre', () => {
  it('devuelve el veredicto y deja el intento en registro_ia', async () => {
    fetchSimulado.mockResolvedValueOnce(
      responder({ veredicto: 'RESUELTO', explicacion: 'La vereda quedó libre.' }),
    );

    const resultado = await compararCierre(operador.id, [jpegConExif()], jpegConExif());

    expect(resultado).toEqual({
      veredicto: 'RESUELTO',
      explicacion: 'La vereda quedó libre.',
      registroIaId: expect.any(Number),
    });
    const registro = await prisma.registroIa.findUnique({ where: { id: resultado.registroIaId } });
    expect(registro).toMatchObject({
      usuarioId: operador.id,
      tipo: 'COMPARACION_CIERRE',
      proveedor: 'ANTHROPIC',
      exito: true,
      salida: { veredicto: 'RESUELTO', explicacion: 'La vereda quedó libre.' },
    });
  });

  it('manda las fotos del antes y la del después en orden, como JPEG', async () => {
    fetchSimulado.mockResolvedValueOnce(
      responder({ veredicto: 'NO_RESUELTO', explicacion: 'El pozo sigue.' }),
    );

    await compararCierre(operador.id, [jpegConExif(), png1x1], jpegConExif());

    const contenido = pedidoEnviado().messages[0].content;
    const imagenes = contenido.filter((bloque: { type: string }) => bloque.type === 'image');
    const texto = contenido.find((bloque: { type: string }) => bloque.type === 'text').text;
    expect(imagenes).toHaveLength(3);
    expect(
      imagenes.every(
        (imagen: { source: { media_type: string } }) => imagen.source.media_type === 'image/jpeg',
      ),
    ).toBe(true);
    expect(texto).toContain('2 imágenes son el antes');
    expect(pedidoEnviado().output_config.effort).toBe('low');
  });

  it('si la IA responde un veredicto inválido lanza IaNoDisponible y registra el fallo', async () => {
    fetchSimulado.mockResolvedValueOnce(responder({ veredicto: 'OTRO', explicacion: 'No sé.' }));

    await expect(compararCierre(operador.id, [jpegConExif()], jpegConExif())).rejects.toBeInstanceOf(
      IaNoDisponible,
    );

    const registros = await prisma.registroIa.findMany({ where: { usuarioId: operador.id } });
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ tipo: 'COMPARACION_CIERRE', exito: false });
  });

  it('sin fotos del antes responde 400 sin consultar a la IA', async () => {
    const consultar = vi.spyOn(servicioIa, 'consultar');

    await expect(compararCierre(operador.id, [], jpegConExif())).rejects.toMatchObject({ status: 400 });

    expect(consultar).not.toHaveBeenCalled();
  });

  it('con una foto que no es imagen responde 400 sin consultar a la IA', async () => {
    const consultar = vi.spyOn(servicioIa, 'consultar');

    await expect(
      compararCierre(operador.id, [Buffer.from('no soy una imagen')], jpegConExif()),
    ).rejects.toMatchObject({ status: 400 });

    expect(consultar).not.toHaveBeenCalled();
  });
});
