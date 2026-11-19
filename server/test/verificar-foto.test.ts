import { randomUUID } from 'node:crypto';
import type { Categoria } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/compartido/prisma.js';
import { IaNoDisponible, crearServicioIa, servicioIa } from '../src/modulos/ia/servicio.js';
import { verificarFoto } from '../src/modulos/ia/verificarFoto.js';
import { crearUsuario } from './apoyo.js';
import { jpegConExif } from './imagenes.js';

// La API de Claude simulada: ningún test sale a la red ni gasta.
const fetchSimulado = vi.fn<typeof fetch>();

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
      usage: { input_tokens: 2500, output_tokens: 80 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

/** Lo que el servidor le mandó a la API en el primer pedido. */
const pedidoEnviado = () => JSON.parse(String(fetchSimulado.mock.calls[0]![1]?.body));

let categoria: Categoria;
let usuarioId: number;

beforeEach(async () => {
  fetchSimulado.mockReset();
  vi.spyOn(servicioIa, 'consultar').mockImplementation(
    crearServicioIa({
      apiKey: 'clave-de-prueba',
      modelo: 'claude-haiku-5-5',
      timeoutMs: 5_000,
      fetch: fetchSimulado,
    }).consultar,
  );
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  categoria = await prisma.categoria.create({ data: { nombre: `Pozo ${randomUUID()}`, areaId: area.id } });
  usuarioId = (await crearUsuario({ rol: 'OPERADOR' })).id;
});

afterEach(() => vi.restoreAllMocks());

const respuestaValida = () => ({
  esProblemaViaPublica: true,
  categoriaId: categoria.id,
  severidad: 'GRAVE',
  mismoProblema: null,
  datosPersonales: false,
  explicacion: 'Se ve un pozo profundo en la calzada.',
});

describe('verificarFoto', () => {
  it('manda la foto sola, sin decirle a la IA qué eligió el vecino, y devuelve su análisis', async () => {
    fetchSimulado.mockResolvedValue(responder(respuestaValida()));

    const resultado = await verificarFoto(usuarioId, jpegConExif(), null);

    expect(resultado).toMatchObject({
      esProblemaViaPublica: true,
      categoriaId: categoria.id,
      severidad: 'GRAVE',
      mismoProblema: null,
      datosPersonales: false,
      explicacion: 'Se ve un pozo profundo en la calzada.',
      registroIaId: expect.any(Number),
      uso: { entrada: 2500, salida: 80 },
    });
    const pedido = pedidoEnviado();
    const imagenes = pedido.messages[0].content.filter((parte: { type: string }) => parte.type === 'image');
    expect(imagenes).toHaveLength(1);
    expect(pedido.output_config.effort).toBe('low');
    const texto = pedido.messages[0].content.find((parte: { type: string }) => parte.type === 'text').text;
    expect(texto).toContain(`${categoria.id}: ${categoria.nombre}`);
    expect(texto).toContain('No hay foto de referencia');
  });

  it('con foto de referencia manda las dos y pide un poco más de esfuerzo', async () => {
    fetchSimulado.mockResolvedValue(responder({ ...respuestaValida(), mismoProblema: true }));

    const resultado = await verificarFoto(usuarioId, jpegConExif(), jpegConExif());

    expect(resultado.mismoProblema).toBe(true);
    const pedido = pedidoEnviado();
    expect(
      pedido.messages[0].content.filter((parte: { type: string }) => parte.type === 'image'),
    ).toHaveLength(2);
    expect(pedido.output_config.effort).toBe('medium');
  });

  it('si no es un problema de la vía pública, la categoría y la severidad no cuentan', async () => {
    fetchSimulado.mockResolvedValue(
      responder({
        ...respuestaValida(),
        esProblemaViaPublica: false,
        explicacion: 'Es un perro en un patio.',
      }),
    );

    const resultado = await verificarFoto(usuarioId, jpegConExif(), null);

    expect(resultado).toMatchObject({ esProblemaViaPublica: false, categoriaId: null, severidad: null });
  });

  it('sin foto de referencia, un mismoProblema que mande la IA se ignora', async () => {
    fetchSimulado.mockResolvedValue(responder({ ...respuestaValida(), mismoProblema: true }));

    expect((await verificarFoto(usuarioId, jpegConExif(), null)).mismoProblema).toBeNull();
  });

  it('una categoría que no está en la lista, o un problema sin categoría, es una respuesta inválida', async () => {
    fetchSimulado.mockResolvedValueOnce(responder({ ...respuestaValida(), categoriaId: 999_999 }));
    await expect(verificarFoto(usuarioId, jpegConExif(), null)).rejects.toBeInstanceOf(IaNoDisponible);

    fetchSimulado.mockResolvedValueOnce(responder({ ...respuestaValida(), categoriaId: null }));
    await expect(verificarFoto(usuarioId, jpegConExif(), null)).rejects.toBeInstanceOf(IaNoDisponible);
  });
});
