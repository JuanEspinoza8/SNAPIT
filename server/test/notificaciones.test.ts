import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { enviarPush } from '../src/modulos/avisos/fcm.js';
import { notificar } from '../src/modulos/avisos/servicio.js';
import { crearIncidente, crearOrganismoDePrueba, crearUsuario, ingresar } from './apoyo.js';

// FCM simulado: ningún test manda un aviso real.
vi.mock('../src/modulos/avisos/fcm.js', () => ({ enviarPush: vi.fn() }));
const enviarPushSimulado = vi.mocked(enviarPush);

let categoriaId: number;
let otraCategoriaId: number;
let incidenteId: number;

beforeAll(async () => {
  categoriaId = (await crearOrganismoDePrueba()).categoria.id;
  otraCategoriaId = (await crearOrganismoDePrueba()).categoria.id;
  incidenteId = await crearIncidente(categoriaId);
});

afterAll(async () => {
  await prisma.incidente.delete({ where: { id: incidenteId } });
});

beforeEach(() => {
  enviarPushSimulado.mockReset();
});

/** FCM acepta todos los tokens, salvo los que tienen un código de error. */
function fcmResponde(errores: Record<string, string> = {}) {
  enviarPushSimulado.mockImplementation(async (tokens) =>
    tokens.map((token) =>
      errores[token] ? { token, aceptado: false, codigo: errores[token] } : { token, aceptado: true },
    ),
  );
}

// El token es único en toda la base: registrar uno repetido lo pasa de cuenta.
const tokenNuevo = () => `token-${randomUUID()}`;

async function vecinoConDispositivos(...tokens: string[]) {
  const vecino = await crearUsuario();
  await prisma.dispositivo.createMany({
    data: tokens.map((tokenPush) => ({ usuarioId: vecino.id, tokenPush, plataforma: 'ANDROID' as const })),
  });
  return vecino;
}

const dispositivo = (tokenPush: string) => prisma.dispositivo.findFirstOrThrow({ where: { tokenPush } });
const avisosDe = (usuarioId: number) => prisma.notificacion.findMany({ where: { usuarioId } });

describe('notificar', () => {
  it('guarda el aviso, lo manda a los dispositivos activos y completa enviada_en', async () => {
    const activo = tokenNuevo();
    const inactivo = tokenNuevo();
    const vecino = await vecinoConDispositivos(activo, inactivo);
    await prisma.dispositivo.updateMany({ where: { tokenPush: inactivo }, data: { activo: false } });
    fcmResponde();

    const resultado = await notificar(vecino.id, 'CAMBIO_ESTADO', incidenteId, 'Cambió', 'Pasó a DERIVADO');

    expect(resultado).toEqual({ id: expect.any(Number), enviada: true });
    expect(enviarPushSimulado).toHaveBeenCalledExactlyOnceWith([activo], {
      titulo: 'Cambió',
      cuerpo: 'Pasó a DERIVADO',
      datos: {
        notificacionId: String(resultado!.id),
        tipo: 'CAMBIO_ESTADO',
        incidenteId: String(incidenteId),
      },
    });
    const aviso = await prisma.notificacion.findUniqueOrThrow({ where: { id: resultado!.id } });
    expect(aviso).toMatchObject({ usuarioId: vecino.id, incidenteId, tipo: 'CAMBIO_ESTADO', leidaEn: null });
    expect(aviso.enviadaEn).toBeInstanceOf(Date);
  });

  it('con todos los avisos apagados no crea ni envía el aviso', async () => {
    const vecino = await vecinoConDispositivos(tokenNuevo());
    await prisma.usuario.update({ where: { id: vecino.id }, data: { notificacionesHabilitadas: false } });
    fcmResponde();

    expect(await notificar(vecino.id, 'CAMBIO_ESTADO', incidenteId, 'Cambió', 'Texto')).toBeNull();
    expect(await avisosDe(vecino.id)).toEqual([]);
    expect(enviarPushSimulado).not.toHaveBeenCalled();
  });

  it('con los avisos de esa categoría apagados no crea ni envía el aviso', async () => {
    const vecino = await vecinoConDispositivos(tokenNuevo());
    await prisma.preferenciaNotificacion.create({
      data: { usuarioId: vecino.id, categoriaId, habilitada: false },
    });
    fcmResponde();

    expect(await notificar(vecino.id, 'CIERRE', incidenteId, 'Resuelto', 'Texto')).toBeNull();
    expect(await avisosDe(vecino.id)).toEqual([]);
    expect(enviarPushSimulado).not.toHaveBeenCalled();
  });

  it('apagar otra categoría no frena los avisos de esta', async () => {
    const vecino = await vecinoConDispositivos(tokenNuevo());
    await prisma.preferenciaNotificacion.create({
      data: { usuarioId: vecino.id, categoriaId: otraCategoriaId, habilitada: false },
    });
    fcmResponde();

    expect(await notificar(vecino.id, 'CIERRE', incidenteId, 'Resuelto', 'Texto')).toMatchObject({
      enviada: true,
    });
  });

  it('un aviso sin incidente solo mira el interruptor general', async () => {
    const token = tokenNuevo();
    const vecino = await vecinoConDispositivos(token);
    await prisma.preferenciaNotificacion.create({
      data: { usuarioId: vecino.id, categoriaId, habilitada: false },
    });
    fcmResponde();

    const resultado = await notificar(vecino.id, 'VERIFICACION', null, 'Tu reporte', 'Está en verificación');

    expect(resultado).toMatchObject({ enviada: true });
    expect(enviarPushSimulado.mock.calls[0]?.[1].datos).toEqual({
      notificacionId: String(resultado!.id),
      tipo: 'VERIFICACION',
    });
  });

  it('a una cuenta dada de baja no le avisa', async () => {
    const vecino = await crearUsuario({ dadoDeBaja: true });

    expect(await notificar(vecino.id, 'CAMBIO_ESTADO', incidenteId, 'Cambió', 'Texto')).toBeNull();
    expect(await avisosDe(vecino.id)).toEqual([]);
  });

  it('un token rechazado por FCM deja ese dispositivo inactivo y los demás siguen', async () => {
    const vigente = tokenNuevo();
    const desinstalado = tokenNuevo();
    const vecino = await vecinoConDispositivos(vigente, desinstalado);
    fcmResponde({ [desinstalado]: 'registration-token-not-registered' });

    expect(await notificar(vecino.id, 'CAMBIO_ESTADO', incidenteId, 'Cambió', 'Texto')).toMatchObject({
      enviada: true,
    });
    expect((await dispositivo(desinstalado)).activo).toBe(false);
    expect((await dispositivo(vigente)).activo).toBe(true);

    // El próximo aviso ya no va al dispositivo dado de baja.
    await notificar(vecino.id, 'CAMBIO_ESTADO', incidenteId, 'Cambió', 'Texto');
    expect(enviarPushSimulado).toHaveBeenLastCalledWith([vigente], expect.anything());
  });

  it('si FCM rechaza todos los tokens, el aviso queda guardado sin enviada_en', async () => {
    const token = tokenNuevo();
    const vecino = await vecinoConDispositivos(token);
    fcmResponde({ [token]: 'invalid-registration-token' });

    const resultado = await notificar(vecino.id, 'CAMBIO_ESTADO', incidenteId, 'Cambió', 'Texto');

    expect(resultado).toMatchObject({ enviada: false });
    expect(
      (await prisma.notificacion.findUniqueOrThrow({ where: { id: resultado!.id } })).enviadaEn,
    ).toBeNull();
    expect((await dispositivo(token)).activo).toBe(false);
  });

  it('una falla de FCM que no es del token deja el dispositivo activo', async () => {
    const token = tokenNuevo();
    const vecino = await vecinoConDispositivos(token);
    fcmResponde({ [token]: 'server-unavailable' });

    expect(await notificar(vecino.id, 'CAMBIO_ESTADO', incidenteId, 'Cambió', 'Texto')).toMatchObject({
      enviada: false,
    });
    expect((await dispositivo(token)).activo).toBe(true);
  });

  it('si FCM no responde, el aviso queda guardado y se ve en la lista', async () => {
    const vecino = await vecinoConDispositivos(tokenNuevo());
    enviarPushSimulado.mockRejectedValue(new Error('FCM no responde'));

    const resultado = await notificar(vecino.id, 'CIERRE', incidenteId, 'Resuelto', 'Ya lo arreglaron');
    expect(resultado).toMatchObject({ enviada: false });

    const res = await request(app)
      .get('/api/notificaciones')
      .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`);
    expect(res.status).toBe(200);
    expect(res.body.notificaciones).toEqual([
      expect.objectContaining({ id: resultado!.id, titulo: 'Resuelto', enviadaEn: null, leidaEn: null }),
    ]);
  });

  it('sin Firebase configurado, el aviso se guarda sin enviar', async () => {
    const vecino = await vecinoConDispositivos(tokenNuevo());
    enviarPushSimulado.mockResolvedValue(null);

    const resultado = await notificar(vecino.id, 'CIERRE', incidenteId, 'Resuelto', 'Texto');

    expect(resultado).toMatchObject({ enviada: false });
    expect(await avisosDe(vecino.id)).toHaveLength(1);
  });

  it('sin dispositivos activos guarda el aviso y no llama a FCM', async () => {
    const vecino = await crearUsuario();

    expect(await notificar(vecino.id, 'CIERRE', incidenteId, 'Resuelto', 'Texto')).toMatchObject({
      enviada: false,
    });
    expect(await avisosDe(vecino.id)).toHaveLength(1);
    expect(enviarPushSimulado).not.toHaveBeenCalled();
  });
});

describe('POST /api/dispositivos', () => {
  const registrar = (token: string, cuerpo: object) =>
    request(app).post('/api/dispositivos').set('Authorization', `Bearer ${token}`).send(cuerpo);

  it('registra el dispositivo activo', async () => {
    const vecino = await crearUsuario();
    const tokenPush = tokenNuevo();

    const res = await registrar(crearTokenAcceso(vecino), { tokenPush, plataforma: 'ANDROID' });

    expect(res.status).toBe(204);
    expect(await dispositivo(tokenPush)).toMatchObject({
      usuarioId: vecino.id,
      plataforma: 'ANDROID',
      activo: true,
      ultimoUsoEn: expect.any(Date),
    });
  });

  it('el mismo token en otra cuenta pasa a la nueva, sin duplicarse', async () => {
    const tokenPush = tokenNuevo();
    const antes = await vecinoConDispositivos(tokenPush);
    const despues = await crearUsuario();

    const res = await registrar(crearTokenAcceso(despues), { tokenPush, plataforma: 'ANDROID' });

    expect(res.status).toBe(204);
    const filas = await prisma.dispositivo.findMany({ where: { tokenPush } });
    expect(filas).toHaveLength(1);
    expect(filas[0]?.usuarioId).toBe(despues.id);
    expect(filas[0]?.usuarioId).not.toBe(antes.id);
  });

  it('volver a registrar un dispositivo inactivo lo reactiva', async () => {
    const tokenPush = tokenNuevo();
    const vecino = await vecinoConDispositivos(tokenPush);
    await prisma.dispositivo.updateMany({ where: { tokenPush }, data: { activo: false } });

    await registrar(crearTokenAcceso(vecino), { tokenPush, plataforma: 'ANDROID' });
    await registrar(crearTokenAcceso(vecino), { tokenPush, plataforma: 'ANDROID' });

    const filas = await prisma.dispositivo.findMany({ where: { tokenPush } });
    expect(filas).toHaveLength(1);
    expect(filas[0]?.activo).toBe(true);
  });

  it('también lo registra un operador', async () => {
    const operador = await crearUsuario({ rol: 'OPERADOR' });

    const res = await registrar(crearTokenAcceso(operador), { tokenPush: tokenNuevo(), plataforma: 'WEB' });

    expect(res.status).toBe(204);
  });

  it('con datos inválidos responde 400 con un detalle por campo', async () => {
    const vecino = await crearUsuario();

    const vacio = await registrar(crearTokenAcceso(vecino), {});
    expect(vacio.status).toBe(400);
    expect(vacio.body.error.detalles).toEqual([
      { campo: 'tokenPush', mensaje: 'Es obligatorio' },
      { campo: 'plataforma', mensaje: 'Tiene que ser ANDROID o WEB' },
    ]);

    const largo = await registrar(crearTokenAcceso(vecino), {
      tokenPush: 'x'.repeat(256),
      plataforma: 'IOS',
    });
    expect(largo.status).toBe(400);
    expect(largo.body.error.detalles.map((d: { campo: string }) => d.campo)).toEqual([
      'tokenPush',
      'plataforma',
    ]);
  });

  it('sin sesión responde 401', async () => {
    const res = await request(app)
      .post('/api/dispositivos')
      .send({ tokenPush: tokenNuevo(), plataforma: 'ANDROID' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/notificaciones', () => {
  it('lista solo los avisos propios, del más nuevo al más viejo', async () => {
    const vecino = await crearUsuario();
    const otro = await crearUsuario();
    const viejo = await prisma.notificacion.create({
      data: {
        usuarioId: vecino.id,
        incidenteId,
        tipo: 'CAMBIO_ESTADO',
        titulo: 'Viejo',
        cuerpo: 'Primero',
        creadoEn: new Date('2026-11-01T10:00:00Z'),
      },
    });
    const nuevo = await prisma.notificacion.create({
      data: {
        usuarioId: vecino.id,
        tipo: 'VERIFICACION',
        titulo: 'Nuevo',
        cuerpo: 'Después',
        creadoEn: new Date('2026-11-02T10:00:00Z'),
        enviadaEn: new Date('2026-11-02T10:00:01Z'),
      },
    });
    await prisma.notificacion.create({
      data: { usuarioId: otro.id, tipo: 'CIERRE', titulo: 'Ajeno', cuerpo: 'De otro' },
    });

    const res = await request(app)
      .get('/api/notificaciones')
      .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      notificaciones: [
        {
          id: nuevo.id,
          tipo: 'VERIFICACION',
          incidenteId: null,
          titulo: 'Nuevo',
          cuerpo: 'Después',
          creadoEn: '2026-11-02T10:00:00.000Z',
          enviadaEn: '2026-11-02T10:00:01.000Z',
          leidaEn: null,
        },
        expect.objectContaining({ id: viejo.id, incidenteId, titulo: 'Viejo' }),
      ],
    });
  });

  it('sin sesión responde 401', async () => {
    expect((await request(app).get('/api/notificaciones')).status).toBe(401);
  });
});

describe('POST /api/notificaciones/:id/leida', () => {
  const marcar = (token: string, id: number | string) =>
    request(app).post(`/api/notificaciones/${id}/leida`).set('Authorization', `Bearer ${token}`);

  async function avisoDe(usuarioId: number) {
    return prisma.notificacion.create({
      data: { usuarioId, tipo: 'CIERRE', titulo: 'Resuelto', cuerpo: 'Texto' },
    });
  }

  it('marca la hora de lectura y, la segunda vez, la conserva', async () => {
    const vecino = await crearUsuario();
    const aviso = await avisoDe(vecino.id);

    expect((await marcar(crearTokenAcceso(vecino), aviso.id)).status).toBe(204);
    const { leidaEn } = await prisma.notificacion.findUniqueOrThrow({ where: { id: aviso.id } });
    expect(leidaEn).toBeInstanceOf(Date);

    expect((await marcar(crearTokenAcceso(vecino), aviso.id)).status).toBe(204);
    expect((await prisma.notificacion.findUniqueOrThrow({ where: { id: aviso.id } })).leidaEn).toEqual(
      leidaEn,
    );
  });

  it('un aviso de otro usuario responde 404 y no se marca', async () => {
    const vecino = await crearUsuario();
    const aviso = await avisoDe((await crearUsuario()).id);

    const res = await marcar(crearTokenAcceso(vecino), aviso.id);

    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('NOTIFICACION_NO_ENCONTRADA');
    expect((await prisma.notificacion.findUniqueOrThrow({ where: { id: aviso.id } })).leidaEn).toBeNull();
  });

  it('un aviso inexistente responde 404 y un id inválido, 400', async () => {
    const token = crearTokenAcceso(await crearUsuario());

    expect((await marcar(token, 2_147_483_647)).status).toBe(404);
    expect((await marcar(token, 'abc')).status).toBe(400);
  });
});

describe('POST /api/auth/salir con tokenPush', () => {
  it('da de baja ese dispositivo de la cuenta y deja los otros', async () => {
    const esteCelular = tokenNuevo();
    const otroCelular = tokenNuevo();
    const vecino = await vecinoConDispositivos(esteCelular, otroCelular);
    const { tokenRenovacion } = (await ingresar(vecino.email)).body;

    const res = await request(app).post('/api/auth/salir').send({ tokenRenovacion, tokenPush: esteCelular });

    expect(res.status).toBe(204);
    expect((await dispositivo(esteCelular)).activo).toBe(false);
    expect((await dispositivo(otroCelular)).activo).toBe(true);
  });

  it('con una sesión que no es válida no toca el dispositivo', async () => {
    const tokenPush = tokenNuevo();
    await vecinoConDispositivos(tokenPush);

    const res = await request(app).post('/api/auth/salir').send({ tokenRenovacion: 'inventado', tokenPush });

    expect(res.status).toBe(204);
    expect((await dispositivo(tokenPush)).activo).toBe(true);
  });

  it('no da de baja el dispositivo de otra cuenta', async () => {
    const ajeno = tokenNuevo();
    await vecinoConDispositivos(ajeno);
    const vecino = await crearUsuario();
    const { tokenRenovacion } = (await ingresar(vecino.email)).body;

    await request(app).post('/api/auth/salir').send({ tokenRenovacion, tokenPush: ajeno });

    expect((await dispositivo(ajeno)).activo).toBe(true);
  });

  it('un tokenPush que no es texto responde 400', async () => {
    const res = await request(app).post('/api/auth/salir').send({ tokenRenovacion: 'algo', tokenPush: 123 });

    expect(res.status).toBe(400);
  });
});
