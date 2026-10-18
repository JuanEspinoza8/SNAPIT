import { randomUUID } from 'node:crypto';
import type { Categoria, Severidad, Usuario } from '@prisma/client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { almacenFotos } from '../src/compartido/almacenFotos.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { crearServicioIa, servicioIa } from '../src/modulos/ia/servicio.js';
import { crearUsuario, tokenDe } from './apoyo.js';
import { jpegConExif, png1x1 } from './imagenes.js';

// La API de Claude simulada: ningún test sale a la red ni gasta.
const fetchSimulado = vi.fn<typeof fetch>();
const servicioSimulado = (timeoutMs = 5_000) =>
  crearServicioIa({ apiKey: 'clave-de-prueba', modelo: 'claude-haiku-5-5', timeoutMs, fetch: fetchSimulado });

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

/** Un pedido que nunca responde: solo termina cuando se corta la espera. */
const nuncaResponde: typeof fetch = (_url, opciones) =>
  new Promise((_resolver, rechazar) => {
    opciones?.signal?.addEventListener('abort', () => rechazar(opciones.signal!.reason));
  });

/** Lo que el servidor le mandó a la API en el primer pedido. */
const pedidoEnviado = () => JSON.parse(String(fetchSimulado.mock.calls[0]![1]?.body));

async function crearCategoria(activa = true) {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  return prisma.categoria.create({
    data: {
      nombre: `Categoría ${randomUUID()}`,
      descripcion: 'Descripción de prueba',
      areaId: area.id,
      activa,
    },
  });
}

let vecino: Usuario;
let token: string;
let categoria: Categoria;

beforeEach(async () => {
  vecino = await crearUsuario({ rol: 'VECINO' });
  token = crearTokenAcceso(vecino);
  categoria = await crearCategoria();
  fetchSimulado.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const clasificar = (foto: Buffer | null = jpegConExif(), nombre = 'foto.jpg', conToken = token) => {
  const pedido = request(app).post('/api/ia/clasificar-foto').set('Authorization', `Bearer ${conToken}`);
  return foto ? pedido.attach('foto', foto, nombre) : pedido.field('nada', '');
};

const registrosDe = (usuarioId: number) =>
  prisma.registroIa.findMany({ where: { usuarioId }, orderBy: { id: 'asc' } });

describe('POST /api/ia/clasificar-foto', () => {
  it('sugiere la categoría y la severidad, y deja el intento en registro_ia', async () => {
    vi.spyOn(servicioIa, 'consultar').mockImplementation(servicioSimulado().consultar);
    fetchSimulado.mockResolvedValueOnce(responder({ categoriaId: categoria.id, severidad: 'GRAVE' }));

    const res = await clasificar();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      categoriaId: categoria.id,
      severidad: 'GRAVE',
      registroIaId: expect.any(Number),
    });
    const [registro] = await registrosDe(vecino.id);
    expect(registro).toMatchObject({
      id: res.body.registroIaId,
      tipo: 'CLASIFICACION_IMAGEN',
      proveedor: 'ANTHROPIC',
      exito: true,
      salida: { categoriaId: categoria.id, severidad: 'GRAVE' },
    });
  });

  it('le manda al modelo la foto como JPEG y solo las categorías activas', async () => {
    const inactiva = await crearCategoria(false);
    vi.spyOn(servicioIa, 'consultar').mockImplementation(servicioSimulado().consultar);
    fetchSimulado.mockResolvedValueOnce(responder({ categoriaId: categoria.id, severidad: 'LEVE' }));

    await clasificar();

    const cuerpo = pedidoEnviado();
    const contenido = cuerpo.messages[0].content;
    const imagen = contenido.find((bloque: { type: string }) => bloque.type === 'image');
    const texto = contenido.find((bloque: { type: string }) => bloque.type === 'text').text;
    expect(imagen.source.media_type).toBe('image/jpeg');
    expect(texto).toContain(`${categoria.id}: ${categoria.nombre}`);
    expect(texto).not.toContain(inactiva.nombre);
    expect(cuerpo.output_config.effort).toBe('low');
  });

  it('acepta PNG y lo manda convertido a JPEG', async () => {
    vi.spyOn(servicioIa, 'consultar').mockImplementation(servicioSimulado().consultar);
    fetchSimulado.mockResolvedValueOnce(responder({ categoriaId: categoria.id, severidad: 'LEVE' }));

    const res = await clasificar(png1x1, 'foto.png');

    expect(res.status).toBe(200);
    const imagen = pedidoEnviado().messages[0].content.find(
      (bloque: { type: string }) => bloque.type === 'image',
    );
    expect(imagen.source.media_type).toBe('image/jpeg');
  });

  it('la foto no se guarda', async () => {
    vi.spyOn(servicioIa, 'consultar').mockImplementation(servicioSimulado().consultar);
    fetchSimulado.mockResolvedValueOnce(responder({ categoriaId: categoria.id, severidad: 'LEVE' }));
    const guardar = vi.spyOn(almacenFotos, 'guardar');

    await clasificar();

    expect(guardar).not.toHaveBeenCalled();
  });

  it('una categoría inventada por el modelo es un fallo: 503 y el intento queda como fallido', async () => {
    vi.spyOn(servicioIa, 'consultar').mockImplementation(servicioSimulado().consultar);
    fetchSimulado.mockResolvedValue(responder({ categoriaId: 999_999_999, severidad: 'GRAVE' }));

    const res = await clasificar();

    expect(res.status).toBe(503);
    expect(res.body.error.codigo).toBe('IA_NO_DISPONIBLE');
    const registros = await registrosDe(vecino.id);
    expect(registros.at(-1)).toMatchObject({ exito: false });
    expect(registros.at(-1)?.error).toContain('No es una de las categorías de la lista');
  });

  it('con la IA colgada responde 503 dentro del timeout', async () => {
    fetchSimulado.mockImplementation(nuncaResponde);
    vi.spyOn(servicioIa, 'consultar').mockImplementation(servicioSimulado(300).consultar);
    const inicio = Date.now();

    const res = await clasificar();

    expect(res.status).toBe(503);
    expect(Date.now() - inicio).toBeLessThan(5_000);
  });

  it('sin clave de la API (como en los tests) responde 503', async () => {
    const res = await clasificar();

    expect(res.status).toBe(503);
    expect(res.body.error.codigo).toBe('IA_NO_DISPONIBLE');
  });

  it('sin foto o con un archivo que no es imagen responde 400 sin consultar a la IA', async () => {
    const consultar = vi.spyOn(servicioIa, 'consultar');

    const sinFoto = await clasificar(null);
    const noImagen = await clasificar(Buffer.from('no soy una imagen'));

    expect(sinFoto.status).toBe(400);
    expect(sinFoto.body.error.detalles).toEqual([{ campo: 'foto', mensaje: 'Es obligatoria' }]);
    expect(noImagen.status).toBe(400);
    expect(consultar).not.toHaveBeenCalled();
  });

  it('solo vecinos: un operador recibe 403 y sin sesión 401', async () => {
    const operador = await clasificar(jpegConExif(), 'foto.jpg', await tokenDe('OPERADOR'));
    const sinSesion = await request(app)
      .post('/api/ia/clasificar-foto')
      .attach('foto', jpegConExif(), 'foto.jpg');

    expect(operador.status).toBe(403);
    expect(sinSesion.status).toBe(401);
  });
});

describe('POST /api/reportes con la sugerencia de la IA', () => {
  /** Una sugerencia exitosa ya registrada, como la deja POST /api/ia/clasificar-foto. */
  const sugerencia = (usuarioId: number, categoriaId: number, severidad: Severidad) =>
    prisma.registroIa.create({
      data: {
        usuarioId,
        tipo: 'CLASIFICACION_IMAGEN',
        proveedor: 'ANTHROPIC',
        modelo: 'claude-haiku-5-5',
        exito: true,
        salida: { categoriaId, severidad },
      },
    });

  const reportar = (campos: Record<string, string | number>) => {
    let pedido = request(app)
      .post('/api/reportes')
      .set('Authorization', `Bearer ${token}`)
      .field('lat', '-38.9516')
      .field('lon', '-68.0591')
      .field('origen', 'APP_MOVIL');
    for (const [campo, valor] of Object.entries(campos)) pedido = pedido.field(campo, String(valor));
    return pedido.attach('foto', jpegConExif(), 'foto.jpg');
  };

  const guardado = (id: number) =>
    prisma.reporte.findUniqueOrThrow({
      where: { id },
      select: {
        categoriaSugeridaId: true,
        severidadSugerida: true,
        sugerenciaAceptada: true,
        registroIaId: true,
      },
    });

  it('si el vecino deja lo sugerido, queda como aceptada', async () => {
    const registro = await sugerencia(vecino.id, categoria.id, 'GRAVE');

    const res = await reportar({
      categoriaId: categoria.id,
      severidadDeclarada: 'GRAVE',
      categoriaSugeridaId: categoria.id,
      severidadSugerida: 'GRAVE',
      registroIaId: registro.id,
    });

    expect(res.status).toBe(201);
    expect(await guardado(res.body.id)).toEqual({
      categoriaSugeridaId: categoria.id,
      severidadSugerida: 'GRAVE',
      sugerenciaAceptada: true,
      registroIaId: registro.id,
    });
  });

  it('si cambia la categoría o la severidad, queda como no aceptada', async () => {
    const otra = await crearCategoria();
    const paraCategoria = await sugerencia(vecino.id, categoria.id, 'GRAVE');
    const paraSeveridad = await sugerencia(vecino.id, categoria.id, 'GRAVE');
    const sugerida = { categoriaSugeridaId: categoria.id, severidadSugerida: 'GRAVE' };

    const otraCategoria = await reportar({
      ...sugerida,
      categoriaId: otra.id,
      severidadDeclarada: 'GRAVE',
      registroIaId: paraCategoria.id,
    });
    const otraSeveridad = await reportar({
      ...sugerida,
      categoriaId: categoria.id,
      severidadDeclarada: 'LEVE',
      registroIaId: paraSeveridad.id,
    });

    expect((await guardado(otraCategoria.body.id)).sugerenciaAceptada).toBe(false);
    expect((await guardado(otraSeveridad.body.id)).sugerenciaAceptada).toBe(false);
  });

  it('sin sugerencia, los campos quedan vacíos', async () => {
    const res = await reportar({ categoriaId: categoria.id, severidadDeclarada: 'LEVE' });

    expect(res.status).toBe(201);
    expect(await guardado(res.body.id)).toEqual({
      categoriaSugeridaId: null,
      severidadSugerida: null,
      sugerenciaAceptada: null,
      registroIaId: null,
    });
  });

  it('con la IA caída el reporte se crea igual, sin sugerencia', async () => {
    const ia = await clasificar();
    const res = await reportar({ categoriaId: categoria.id, severidadDeclarada: 'MODERADA' });

    expect(ia.status).toBe(503);
    expect(res.status).toBe(201);
  });

  describe('una sugerencia que no vale → 400', () => {
    it('falta alguno de los tres datos', async () => {
      const res = await reportar({ categoriaId: categoria.id, severidadDeclarada: 'LEVE', registroIaId: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error.detalles.map((d: { campo: string }) => d.campo).sort()).toEqual([
        'categoriaSugeridaId',
        'severidadSugerida',
      ]);
    });

    it('es de otro vecino', async () => {
      const otro = await crearUsuario({ rol: 'VECINO' });
      const registro = await sugerencia(otro.id, categoria.id, 'LEVE');

      const res = await reportar({
        categoriaId: categoria.id,
        severidadDeclarada: 'LEVE',
        categoriaSugeridaId: categoria.id,
        severidadSugerida: 'LEVE',
        registroIaId: registro.id,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.detalles[0]).toEqual({
        campo: 'registroIaId',
        mensaje: 'No es una sugerencia de la IA pedida por vos',
      });
    });

    it('no coincide con lo que respondió la IA', async () => {
      const registro = await sugerencia(vecino.id, categoria.id, 'LEVE');

      const res = await reportar({
        categoriaId: categoria.id,
        severidadDeclarada: 'GRAVE',
        categoriaSugeridaId: categoria.id,
        severidadSugerida: 'GRAVE',
        registroIaId: registro.id,
      });

      expect(res.status).toBe(400);
      expect(res.body.error.detalles[0].mensaje).toBe('No coincide con lo que sugirió la IA');
    });

    it('ya se usó en otro reporte', async () => {
      const registro = await sugerencia(vecino.id, categoria.id, 'LEVE');
      const campos = {
        categoriaId: categoria.id,
        severidadDeclarada: 'LEVE',
        categoriaSugeridaId: categoria.id,
        severidadSugerida: 'LEVE',
        registroIaId: registro.id,
      };

      const primero = await reportar(campos);
      const segundo = await reportar(campos);

      expect(primero.status).toBe(201);
      expect(segundo.status).toBe(400);
      expect(segundo.body.error.detalles[0].mensaje).toBe('Esa sugerencia ya se usó en otro reporte');
    });

    it('es un intento fallido de la IA', async () => {
      const fallido = await prisma.registroIa.create({
        data: {
          usuarioId: vecino.id,
          tipo: 'CLASIFICACION_IMAGEN',
          proveedor: 'ANTHROPIC',
          modelo: 'claude-haiku-5-5',
          exito: false,
          error: 'simulado',
        },
      });

      const res = await reportar({
        categoriaId: categoria.id,
        severidadDeclarada: 'LEVE',
        categoriaSugeridaId: categoria.id,
        severidadSugerida: 'LEVE',
        registroIaId: fallido.id,
      });

      expect(res.status).toBe(400);
    });
  });
});
