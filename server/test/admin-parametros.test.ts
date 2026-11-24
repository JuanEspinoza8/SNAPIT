import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import {
  clavesDeclaradas,
  crearCacheParametros,
  definirParametros,
  leerParametrosNumericos,
  noNegativo,
  positivo,
} from '../src/compartido/parametros.js';
import { prisma } from '../src/compartido/prisma.js';
import { problemaDelValor } from '../src/modulos/parametros/calculo.js';
import { PARAMETROS } from '../src/semilla/datos.js';
import { tokenDe } from './apoyo.js';

// Claves propias de cada corrida, con su regla declarada como lo hace cada cálculo: ningún otro test las lee.
async function parametrosDePrueba() {
  const prefijo = `prueba.${randomUUID()}`;
  const definicion = definirParametros({
    radio: { clave: `${prefijo}.radio_m`, valor: 30, valido: positivo },
    peso: { clave: `${prefijo}.peso`, valor: 0.5, valido: noNegativo },
    libre: { clave: `${prefijo}.libre`, valor: 1 },
  });
  await prisma.parametroSistema.createMany({
    data: [
      { clave: definicion.radio.clave, valor: '30', tipo: 'entero', descripcion: 'Radio de prueba' },
      { clave: definicion.peso.clave, valor: '0.5', tipo: 'decimal' },
      { clave: definicion.libre.clave, valor: '1', tipo: 'decimal' },
      { clave: `${prefijo}.factor`, valor: '2.0', tipo: 'factor' },
    ],
  });
  return { definicion, factor: `${prefijo}.factor` };
}

const guardar = async (parametros: { clave: string; valor: string | number }[], token?: string) =>
  request(app)
    .put('/api/admin/parametros')
    .set('Authorization', `Bearer ${token ?? (await tokenDe('ADMINISTRADOR'))}`)
    .send({ parametros });

describe('GET /api/admin/parametros', () => {
  it('lista todos los parámetros con su tipo y descripción', async () => {
    const { definicion } = await parametrosDePrueba();

    const res = await request(app)
      .get('/api/admin/parametros')
      .set('Authorization', `Bearer ${await tokenDe('ADMINISTRADOR')}`);

    expect(res.status).toBe(200);
    expect(res.body.parametros).toContainEqual({
      clave: definicion.radio.clave,
      valor: '30',
      tipo: 'entero',
      descripcion: 'Radio de prueba',
    });
  });
});

describe('PUT /api/admin/parametros', () => {
  it('guarda varios juntos y el próximo cálculo ya usa los valores nuevos', async () => {
    const { definicion, factor } = await parametrosDePrueba();

    const res = await guardar([
      { clave: definicion.radio.clave, valor: 45 },
      { clave: definicion.peso.clave, valor: ' 0.75 ' },
      { clave: factor, valor: 'intransitable' },
    ]);

    expect(res.status).toBe(200);
    expect(res.body.parametros).toMatchObject([
      { clave: definicion.radio.clave, valor: '45' },
      { clave: definicion.peso.clave, valor: '0.75' },
      { clave: factor, valor: 'intransitable' },
    ]);
    expect(await leerParametrosNumericos(definicion)).toEqual({ radio: 45, peso: 0.75, libre: 1 });
  });

  it('un valor que no corresponde a su tipo o a la regla de su clave da 400 y no guarda ninguno', async () => {
    const { definicion, factor } = await parametrosDePrueba();

    const res = await guardar([
      { clave: definicion.libre.clave, valor: '7' },
      { clave: definicion.radio.clave, valor: '0' },
      { clave: definicion.peso.clave, valor: '-1' },
      { clave: factor, valor: '0' },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: definicion.radio.clave, mensaje: 'Tiene que ser mayor que 0' },
      { campo: definicion.peso.clave, mensaje: 'No puede ser negativo' },
      { campo: factor, mensaje: 'Tiene que ser un número mayor que 0 o «intransitable»' },
    ]);
    const libre = await prisma.parametroSistema.findUnique({ where: { clave: definicion.libre.clave } });
    expect(libre?.valor).toBe('1');
  });

  it('un entero con decimales, un decimal con coma o un texto dan 400', async () => {
    const { definicion } = await parametrosDePrueba();

    const res = await guardar([
      { clave: definicion.radio.clave, valor: '30.5' },
      { clave: definicion.peso.clave, valor: '0,5' },
      { clave: definicion.libre.clave, valor: 'mucho' },
    ]);

    expect(res.body.error.detalles).toEqual([
      { campo: definicion.radio.clave, mensaje: 'Tiene que ser un número entero' },
      { campo: definicion.peso.clave, mensaje: 'Tiene que ser un número, con punto para los decimales' },
      { campo: definicion.libre.clave, mensaje: 'Tiene que ser un número, con punto para los decimales' },
    ]);
  });

  it('una clave que no existe da 404, una repetida o una lista vacía dan 400', async () => {
    const { definicion } = await parametrosDePrueba();

    const inexistente = await guardar([{ clave: 'no.existe', valor: '1' }]);
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.codigo).toBe('PARAMETRO_NO_ENCONTRADO');

    const repetida = await guardar([
      { clave: definicion.radio.clave, valor: '1' },
      { clave: definicion.radio.clave, valor: '2' },
    ]);
    expect(repetida.status).toBe(400);
    expect(repetida.body.error.detalles).toEqual([
      { campo: definicion.radio.clave, mensaje: 'Viene más de una vez' },
    ]);

    expect((await guardar([])).status).toBe(400);
  });

  it('un vecino o un operador recibe 403, y sin sesión 401', async () => {
    const { definicion } = await parametrosDePrueba();
    const cambio = [{ clave: definicion.radio.clave, valor: '99' }];

    for (const rol of ['VECINO', 'OPERADOR'] as const) {
      const token = await tokenDe(rol);
      expect((await guardar(cambio, token)).status).toBe(403);
      expect(
        (await request(app).get('/api/admin/parametros').set('Authorization', `Bearer ${token}`)).status,
      ).toBe(403);
    }
    expect((await request(app).put('/api/admin/parametros').send({ parametros: cambio })).status).toBe(401);
    const radio = await prisma.parametroSistema.findUnique({ where: { clave: definicion.radio.clave } });
    expect(radio?.valor).toBe('30');
  });
});

describe('reglas de los parámetros de la semilla', () => {
  it('cada parámetro numérico de la semilla lo declara algún cálculo, y su valor inicial cumple la regla', () => {
    const declaradas = new Set(clavesDeclaradas());
    const sinDeclarar = PARAMETROS.map((parametro) => parametro.clave).filter(
      (clave) => !declaradas.has(clave),
    );
    // Los que leen otros módulos sin definirParametros quedan validados solo por su tipo: que sea a propósito.
    expect(sinDeclarar).toEqual([]);
    for (const { clave, tipo, valor } of PARAMETROS) {
      expect(problemaDelValor(clave, tipo, valor), clave).toBeNull();
    }
  });
});

describe('caché de parámetros', () => {
  function baseFalsa(valores: Record<string, string>) {
    let lecturas = 0;
    const cliente = {
      parametroSistema: {
        findMany: async () => {
          lecturas++;
          return Object.entries(valores).map(([clave, valor]) => ({ clave, valor }));
        },
      },
    } as unknown as Parameters<ReturnType<typeof crearCacheParametros>['leer']>[0];
    return { cliente, valores, lecturas: () => lecturas };
  }

  it('dura lo que se le dice: dentro de ese tiempo no vuelve a la base', async () => {
    let ahora = 0;
    const cache = crearCacheParametros({ vidaMs: 60_000, ahora: () => ahora });
    const base = baseFalsa({ 'a.b': '1' });

    expect((await cache.leer(base.cliente)).get('a.b')).toBe('1');
    base.valores['a.b'] = '2';
    ahora = 59_999;
    expect((await cache.leer(base.cliente)).get('a.b')).toBe('1');
    expect(base.lecturas()).toBe(1);

    ahora = 60_000;
    expect((await cache.leer(base.cliente)).get('a.b')).toBe('2');
    expect(base.lecturas()).toBe(2);
  });

  it('al invalidarla, la próxima lectura va a la base', async () => {
    const cache = crearCacheParametros({ vidaMs: 60_000, ahora: () => 0 });
    const base = baseFalsa({ 'a.b': '1' });
    await cache.leer(base.cliente);

    base.valores['a.b'] = '2';
    cache.invalidar();

    expect((await cache.leer(base.cliente)).get('a.b')).toBe('2');
  });

  it('una lectura que empezó antes de invalidar no queda guardada', async () => {
    const cache = crearCacheParametros({ vidaMs: 60_000, ahora: () => 0 });
    let soltar!: () => void;
    const lenta = {
      parametroSistema: {
        findMany: () =>
          new Promise((resolver) => {
            soltar = () => resolver([{ clave: 'a.b', valor: 'viejo' }]);
          }),
      },
    } as unknown as Parameters<typeof cache.leer>[0];
    const base = baseFalsa({ 'a.b': 'nuevo' });

    const enCurso = cache.leer(lenta);
    cache.invalidar();
    soltar();
    expect((await enCurso).get('a.b')).toBe('viejo');

    expect((await cache.leer(base.cliente)).get('a.b')).toBe('nuevo');
  });

  it('con vida 0 no guarda nada', async () => {
    const cache = crearCacheParametros({ vidaMs: 0 });
    const base = baseFalsa({ 'a.b': '1' });
    await cache.leer(base.cliente);
    await cache.leer(base.cliente);
    expect(base.lecturas()).toBe(2);
  });
});
