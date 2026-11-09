import type { Area, Categoria, Usuario } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { esperarTareasPendientes } from '../src/compartido/despuesDeConfirmar.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { avisarCambioDeEstado } from '../src/modulos/avisos/disparar.js';
import { alCambiarIncidente } from '../src/modulos/incidentes/eventos.js';
import { transaccion } from '../src/modulos/reportes/repositorio.js';
import { borrarReportesDe, crearOrganismoDePrueba, crearUsuario, reportarEn } from './apoyo.js';
import { fotoUnica, jpegSinExif } from './imagenes.js';

// Sin red: la dirección no se consulta y Firebase no está configurado (el aviso se guarda igual).
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));
vi.mock('../src/modulos/avisos/fcm.js', () => ({ enviarPush: vi.fn(async () => null) }));

// Para simular que la base falla con un destinatario: las próximas `fallas.proximas` llamadas a notificar fallan.
const fallas = vi.hoisted(() => ({ proximas: 0 }));
vi.mock('../src/modulos/avisos/servicio.js', async (original) => {
  const real = await original<typeof import('../src/modulos/avisos/servicio.js')>();
  return {
    ...real,
    notificar: async (...datos: Parameters<typeof real.notificar>) => {
      if (fallas.proximas > 0) {
        fallas.proximas--;
        throw new Error('La base no respondió');
      }
      return real.notificar(...datos);
    },
  };
});

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

let area: Area;
let categoria: Categoria;
let operador: Usuario;
let token: string;
let punto: { lat: number; lon: number };

beforeEach(async () => {
  ({ area, categoria } = await crearOrganismoDePrueba());
  operador = await crearUsuario({ rol: 'OPERADOR', organismoId: area.organismoId, areaId: area.id });
  token = crearTokenAcceso(operador);
  // Cada test en su lugar: los incidentes de uno no se agrupan con los de otro.
  punto = { lat: -38.9 - Math.random() * 0.1, lon: -68.1 - Math.random() * 0.1 };
});

async function reportar(opciones: { pendiente?: boolean } = {}) {
  const reporte = await reportarEn(punto, { categoriaId: categoria.id, ...opciones });
  vecinos.push(reporte.vecinoId);
  return reporte;
}

const seguir = (incidenteId: number, usuarioId: number) =>
  prisma.seguimientoIncidente.create({ data: { usuarioId, incidenteId } });

/** Los avisos que le llegaron al usuario, cuando ya salieron todos los pendientes. */
async function avisosDe(usuarioId: number) {
  await esperarTareasPendientes();
  return prisma.notificacion.findMany({
    where: { usuarioId },
    select: { tipo: true, titulo: true, cuerpo: true, incidenteId: true },
    orderBy: { id: 'asc' },
  });
}

const borrarAvisos = async (usuarioIds: number[]) => {
  await esperarTareasPendientes();
  await prisma.notificacion.deleteMany({ where: { usuarioId: { in: usuarioIds } } });
};

describe('aviso de cambio de estado', () => {
  it('llega una sola vez a quienes reportaron o siguen el incidente, y no a quien hizo el cambio', async () => {
    const primero = await reportar();
    const segundo = await reportar();
    expect(segundo.incidenteId).toBe(primero.incidenteId);
    const id = primero.incidenteId;
    const seguidor = await crearUsuario({ rol: 'VECINO' });
    // El segundo vecino reportó y además lo sigue; el operador también lo sigue.
    await Promise.all([seguir(id, segundo.vecinoId), seguir(id, seguidor.id), seguir(id, operador.id)]);
    const todos = [primero.vecinoId, segundo.vecinoId, seguidor.id, operador.id];
    await borrarAvisos(todos);

    const res = await request(app)
      .post(`/api/incidentes/${id}/derivacion`)
      .set('Authorization', `Bearer ${token}`)
      .send({ areaId: area.id });
    expect(res.status).toBe(200);

    for (const usuarioId of [primero.vecinoId, segundo.vecinoId, seguidor.id]) {
      expect(await avisosDe(usuarioId)).toEqual([
        {
          tipo: 'CAMBIO_ESTADO',
          titulo: 'Cambió el estado de un incidente',
          cuerpo: `«${categoria.nombre}» pasó a derivado al área que lo resuelve.`,
          incidenteId: id,
        },
      ]);
    }
    expect(await avisosDe(operador.id)).toEqual([]);
  });

  it('al resolverse, quienes lo reportaron reciben el aviso de cierre y quien solo lo sigue, el de cambio de estado', async () => {
    const reporte = await reportar();
    const seguidor = await crearUsuario({ rol: 'VECINO' });
    await seguir(reporte.incidenteId, seguidor.id);
    await borrarAvisos([reporte.vecinoId, seguidor.id]);

    // Como lo deja el cierre con la foto del después (#108): un cambio de estado a RESUELTO.
    await transaccion(async () => {
      avisarCambioDeEstado(reporte.incidenteId, 'EN_EJECUCION', 'RESUELTO', operador.id);
    });

    expect((await avisosDe(reporte.vecinoId)).map((aviso) => aviso.tipo)).toEqual(['CIERRE']);
    expect((await avisosDe(seguidor.id)).map((aviso) => aviso.tipo)).toEqual(['CAMBIO_ESTADO']);
  });

  it('si la transacción falla, no sale ningún aviso', async () => {
    const reporte = await reportar();
    await borrarAvisos([reporte.vecinoId]);

    await expect(
      transaccion(async () => {
        avisarCambioDeEstado(reporte.incidenteId, 'DERIVADO', 'EN_EJECUCION', operador.id);
        throw new Error('se deshizo');
      }),
    ).rejects.toThrow('se deshizo');

    expect(await avisosDe(reporte.vecinoId)).toEqual([]);
  });

  it('si falla el aviso a uno, los demás lo reciben igual', async () => {
    const primero = await reportar();
    const segundo = await reportar();
    expect(segundo.incidenteId).toBe(primero.incidenteId);
    await borrarAvisos([primero.vecinoId, segundo.vecinoId]);
    fallas.proximas = 1;

    const res = await request(app)
      .post(`/api/incidentes/${primero.incidenteId}/derivacion`)
      .set('Authorization', `Bearer ${token}`)
      .send({ areaId: area.id });
    expect(res.status).toBe(200);

    // Falla el primero que se avisa (cualquiera de los dos): el otro recibe el suyo.
    const avisos = [...(await avisosDe(primero.vecinoId)), ...(await avisosDe(segundo.vecinoId))];
    expect(fallas.proximas).toBe(0);
    expect(avisos.map((aviso) => aviso.tipo)).toEqual(['CAMBIO_ESTADO']);
  });
});

describe('aviso de verificación', () => {
  it('al crear un reporte pendiente avisa que está en verificación, y al revisarlo, cómo quedó: sin repetir', async () => {
    const reporte = await reportar({ pendiente: true });

    expect(await avisosDe(reporte.vecinoId)).toEqual([
      expect.objectContaining({ tipo: 'VERIFICACION', titulo: 'Tu reporte está en verificación' }),
    ]);
    await borrarAvisos([reporte.vecinoId]);

    const res = await request(app)
      .post(`/api/reportes/${reporte.id}/revision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'VERIFICADO' });
    expect(res.status).toBe(200);

    // La revisión también verificó el incidente, pero el autor recibe un solo aviso por ese hecho.
    expect(await avisosDe(reporte.vecinoId)).toEqual([
      {
        tipo: 'VERIFICACION',
        titulo: 'Tu reporte se verificó',
        cuerpo: `Tu reporte de «${categoria.nombre}» ya está publicado en el mapa.`,
        incidenteId: reporte.incidenteId,
      },
    ]);
  });

  it('un reporte verificado al llegar no genera avisos para su autor', async () => {
    const reporte = await reportar();
    expect(await avisosDe(reporte.vecinoId)).toEqual([]);
  });

  it('un reporte desestimado le avisa al autor que no se publicó', async () => {
    const reporte = await reportar({ pendiente: true });
    await borrarAvisos([reporte.vecinoId]);

    await request(app)
      .post(`/api/reportes/${reporte.id}/revision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'DESESTIMADO', comentario: 'No se ve el problema' });

    expect((await avisosDe(reporte.vecinoId)).map((aviso) => aviso.titulo)).toEqual([
      'Tu reporte se desestimó',
    ]);
  });

  it('si la revisión se deshace, el autor no recibe ningún aviso', async () => {
    const reporte = await reportar({ pendiente: true });
    await borrarAvisos([reporte.vecinoId]);
    // Algo falla después de aplicar el resultado, dentro de la misma transacción.
    const quitar = alCambiarIncidente(async () => {
      throw new Error('se deshizo');
    });
    try {
      const res = await request(app)
        .post(`/api/reportes/${reporte.id}/revision`)
        .set('Authorization', `Bearer ${token}`)
        .send({ decision: 'VERIFICADO' });
      expect(res.status).toBe(500);
    } finally {
      quitar();
    }

    expect(await avisosDe(reporte.vecinoId)).toEqual([]);
    const { estadoVerificacion } = await prisma.reporte.findUniqueOrThrow({ where: { id: reporte.id } });
    expect(estadoVerificacion).toBe('PENDIENTE_REVISION');
  });
});

describe('aviso de algo nuevo en una zona habitual', () => {
  it('llega a quien tiene una zona que contiene el incidente nuevo, no a 1 m fuera del radio ni a quien lo reportó', async () => {
    // El centro de las zonas, a unos 110 m del punto donde se va a reportar.
    const centro = { lat: punto.lat + 0.001, lon: punto.lon };
    const [{ distancia }] = await prisma.$queryRaw<{ distancia: number }[]>`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${centro.lon}, ${centro.lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${punto.lon}, ${punto.lat}), 4326)::geography) AS distancia`;
    const zona = async (radioMetros: number) => {
      const vecino = await crearUsuario({ rol: 'VECINO' });
      await request(app)
        .post('/api/zonas-habituales')
        .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
        .send({ nombre: 'Casa', ...centro, radioMetros })
        .expect(201);
      return vecino.id;
    };
    const adentro = await zona(Math.ceil(distancia) + 1);
    // El incidente queda al menos 1 m fuera de este radio.
    const afuera = await zona(Math.floor(distancia - 1));

    await reportar();

    expect(await avisosDe(adentro)).toEqual([
      expect.objectContaining({
        tipo: 'NUEVO_EN_ZONA',
        titulo: 'Algo nuevo en Casa',
        cuerpo: `Reportaron «${categoria.nombre}», dentro de tu zona.`,
      }),
    ]);
    expect(await avisosDe(afuera)).toEqual([]);
  });

  it('quien reporta no se avisa de su propio reporte aunque caiga en su zona', async () => {
    const vecino = await crearUsuario({ rol: 'VECINO' });
    vecinos.push(vecino.id);
    await request(app)
      .post('/api/zonas-habituales')
      .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
      .send({ nombre: 'Casa', ...punto, radioMetros: 200 })
      .expect(201);
    const res = await request(app)
      .post('/api/reportes')
      .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
      .field('categoriaId', String(categoria.id))
      .field('severidadDeclarada', 'MODERADA')
      .field('lat', String(punto.lat))
      .field('lon', String(punto.lon))
      .field('origen', 'APP_MOVIL')
      .field('tomadaConCamaraApp', 'true')
      .attach('foto', await fotoUnica(jpegSinExif()), 'foto.jpg');
    expect(res.status).toBe(201);

    expect((await avisosDe(vecino.id)).map((aviso) => aviso.tipo)).not.toContain('NUEVO_EN_ZONA');
  });
});
