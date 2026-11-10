import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { almacenDisco, almacenSupabase } from '../src/compartido/almacenFotos.js';

const RUTA_NUEVA = /^[0-9a-f-]{36}\.(jpg|png)$/;

describe('almacén en disco', () => {
  const carpeta = path.join(os.tmpdir(), `snapit-almacen-${randomUUID()}`);
  const almacen = almacenDisco(carpeta);
  afterAll(() => rm(carpeta, { recursive: true, force: true }));

  it('guarda el archivo tal cual y lo devuelve al leerlo', async () => {
    const contenido = Buffer.from('una foto');

    const ruta = await almacen.guardar(contenido, 'jpg');

    expect(ruta).toMatch(RUTA_NUEVA);
    expect(await almacen.leer(ruta)).toEqual(contenido);
  });

  it('una foto que ya no está se lee como null, y borrarla otra vez no falla', async () => {
    const ruta = await almacen.guardar(Buffer.from('x'), 'png');
    await almacen.borrar(ruta);

    expect(await almacen.leer(ruta)).toBeNull();
    await expect(almacen.borrar(ruta)).resolves.toBeUndefined();
  });
});

describe('almacén en Supabase Storage', () => {
  const config = { url: 'https://proyecto.supabase.co', claveSecreta: 'sb_secret_prueba', bucket: 'fotos' };
  const objeto = (ruta: string) => `https://proyecto.supabase.co/storage/v1/object/fotos/${ruta}`;

  /** Un almacén cuyo fetch responde, en orden, lo que se le pasa. */
  function simular(...respuestas: Response[]) {
    const pedir = vi.fn<typeof fetch>();
    for (const respuesta of respuestas) pedir.mockResolvedValueOnce(respuesta);
    return { pedir, almacen: almacenSupabase(config, pedir) };
  }

  const json = (status: number, cuerpo: unknown) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

  it('guarda con un POST al bucket, con la clave secreta y el tipo de la foto', async () => {
    const { pedir, almacen } = simular(json(200, { Key: 'fotos/x.jpg' }));

    const ruta = await almacen.guardar(Buffer.from('foto'), 'jpg');

    expect(ruta).toMatch(RUTA_NUEVA);
    const [url, opciones] = pedir.mock.calls[0]!;
    expect(url).toBe(objeto(ruta));
    expect(opciones).toMatchObject({
      method: 'POST',
      headers: { apikey: 'sb_secret_prueba', 'Content-Type': 'image/jpeg' },
    });
    // Sin x-upsert: nunca pisa otra foto.
    expect(opciones?.headers).not.toHaveProperty('x-upsert');
    expect(Buffer.from(opciones!.body as Uint8Array).toString()).toBe('foto');
  });

  it('si Supabase rechaza la subida, falla con el status y lo que respondió', async () => {
    const { almacen } = simular(json(403, { message: 'invalid signature' }));

    await expect(almacen.guardar(Buffer.from('foto'), 'png')).rejects.toThrow(/403.*invalid signature/);
  });

  it('lee la foto por el endpoint autenticado del bucket privado', async () => {
    const { pedir, almacen } = simular(new Response('bytes de la foto'));

    const contenido = await almacen.leer('a.jpg');

    expect(contenido?.toString()).toBe('bytes de la foto');
    expect(pedir.mock.calls[0]![0]).toBe(
      'https://proyecto.supabase.co/storage/v1/object/authenticated/fotos/a.jpg',
    );
    expect(pedir.mock.calls[0]![1]).toMatchObject({ headers: { apikey: 'sb_secret_prueba' } });
  });

  it.each([
    ['un 404', json(404, { message: 'Object not found' })],
    [
      'un 400 con statusCode 404',
      json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' }),
    ],
  ])('una foto que no está (%s) se lee como null', async (_caso, respuesta) => {
    const { almacen } = simular(respuesta);

    expect(await almacen.leer('a.jpg')).toBeNull();
  });

  it('un 400 por otro motivo no se confunde con una foto que no está', async () => {
    const { almacen } = simular(
      json(400, { statusCode: '400', error: 'InvalidKey', message: 'Invalid key' }),
    );

    await expect(almacen.leer('a.jpg')).rejects.toThrow(/400/);
  });

  it('si Supabase falla al leer, el error sube', async () => {
    const { almacen } = simular(json(500, { message: 'internal' }));

    await expect(almacen.leer('a.jpg')).rejects.toThrow(/500/);
  });

  it('borra con un DELETE, y no falla si la foto ya no estaba', async () => {
    const { pedir, almacen } = simular(json(200, []), json(404, { message: 'Object not found' }));

    await almacen.borrar('a.jpg');
    await almacen.borrar('a.jpg');

    expect(pedir).toHaveBeenCalledTimes(2);
    expect(pedir.mock.calls[0]![0]).toBe(objeto('a.jpg'));
    expect(pedir.mock.calls[0]![1]).toMatchObject({
      method: 'DELETE',
      headers: { apikey: 'sb_secret_prueba' },
    });
  });

  it('si Supabase falla al borrar, el error sube', async () => {
    const { almacen } = simular(json(500, { message: 'internal' }));

    await expect(almacen.borrar('a.jpg')).rejects.toThrow(/500/);
  });
});
