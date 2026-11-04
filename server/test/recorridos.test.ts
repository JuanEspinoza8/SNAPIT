import { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { borrarReportesDe, crearUsuario, reportarEn } from './apoyo.js';

// Reemplaza toda la red de la base de pruebas, como importar-red.test.ts y vinculos.test.ts: corre solo, al final
// (vitest.config.ts). Usa los perfiles, las categorías y los parámetros que carga la semilla.

// La dirección no se consulta: no hace falta para el recorrido.
vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

/*
 * Una grilla de 3 × 3 esquinas armada directo en la base, lejos de Neuquén y de las grillas de los otros tests.
 * Cada nombre es columna y fila; las cuadras miden unos 100 m y todas arrancan como veredas con rampa:
 *
 *   02 ── 12 ── 22
 *   │     │     │
 *   01 ── 11 ── 21
 *   │     │     │
 *   00 ── 10 ── 20
 *
 * La zona de prueba va de la columna y la fila −1,5 a la 3,5, así hay lugares adentro lejos de la red.
 */
const enGrilla = (columna: number, fila: number) => ({
  lon: -68.6 + columna * 0.00115,
  lat: -38.6 + fila * 0.0009,
});
const ESQUINAS = [0, 1, 2].flatMap((columna) => [0, 1, 2].map((fila) => `${columna}${fila}`));
const BASE = 800_000_000_000_000;
const osmId = (esquina: string) => BigInt(BASE + Number(esquina));
const punto = (esquina: string) => enGrilla(Number(esquina[0]), Number(esquina[1]));
const CUADRAS: [string, string][] = [
  ['00', '10'],
  ['10', '20'],
  ['01', '11'],
  ['11', '21'],
  ['02', '12'],
  ['12', '22'],
  ['00', '01'],
  ['01', '02'],
  ['10', '11'],
  ['11', '12'],
  ['20', '21'],
  ['21', '22'],
];
const ZONA = 'Zona de prueba de recorridos';

let token: string;
const perfiles = new Map<string, number>();
const vecinos: number[] = [];

const comoTexto = ({ lat, lon }: { lat: number; lon: number }) => `${lat},${lon}`;

function pedirRecorrido(
  perfil: string,
  desde: string | { lat: number; lon: number },
  hasta: string | { lat: number; lon: number },
) {
  return request(app)
    .get('/api/recorridos')
    .set('Authorization', `Bearer ${token}`)
    .query({
      origen: comoTexto(typeof desde === 'string' ? punto(desde) : desde),
      destino: comoTexto(typeof hasta === 'string' ? punto(hasta) : hasta),
      perfilId: perfiles.get(perfil),
    });
}

/** Las esquinas por las que pasa la geometría del recorrido, en orden. */
function esquinasDe(geometria: { coordinates: [number, number][] }) {
  return geometria.coordinates.map(
    ([lon, lat]) => `${Math.round((lon + 68.6) / 0.00115)}${Math.round((lat + 38.6) / 0.0009)}`,
  );
}

/** Si el recorrido usa la cuadra entre esas dos esquinas, en cualquier sentido. */
function pasaPor(esquinas: string[], a: string, b: string) {
  return esquinas.some((esquina, i) => {
    const siguiente = esquinas[i + 1];
    return (esquina === a && siguiente === b) || (esquina === b && siguiente === a);
  });
}

/** Cambia columnas de la cuadra entre esas dos esquinas. Después de cada test se vuelve a la grilla original. */
function cambiarCuadra(a: string, b: string, cambios: Prisma.Sql) {
  return prisma.$executeRaw`
    UPDATE tramo_peatonal t SET ${cambios}
    FROM nodo_peatonal o, nodo_peatonal d
    WHERE t.nodo_origen_id = o.id AND t.nodo_destino_id = d.id
      AND ((o.osm_id = ${osmId(a)} AND d.osm_id = ${osmId(b)}) OR (o.osm_id = ${osmId(b)} AND d.osm_id = ${osmId(a)}))`;
}

const vaciarRed = () => prisma.$executeRaw`TRUNCATE tramo_peatonal, nodo_peatonal RESTART IDENTITY CASCADE`;

/** Un incidente de esa categoría de la semilla en ese punto, ya vinculado con los tramos que obstruye. */
async function incidenteEn(lugar: { lat: number; lon: number }, categoria: string) {
  const { id } = await prisma.categoria.findUniqueOrThrow({ where: { nombre: categoria } });
  const reporte = await reportarEn(lugar, { categoriaId: id });
  vecinos.push(reporte.vecinoId);
  return reporte.incidenteId;
}

beforeAll(async () => {
  token = crearTokenAcceso(await crearUsuario());
  for (const perfil of await prisma.perfilMovilidad.findMany()) perfiles.set(perfil.nombre, perfil.id);

  await prisma.$executeRaw`DELETE FROM zona_piloto WHERE nombre = ${ZONA}`;
  const borde = [
    [-1.5, -1.5],
    [3.5, -1.5],
    [3.5, 3.5],
    [-1.5, 3.5],
    [-1.5, -1.5],
  ].map(([columna, fila]) => enGrilla(columna!, fila!));
  const poligono = `POLYGON((${borde.map(({ lon, lat }) => `${lon} ${lat}`).join(', ')}))`;
  await prisma.$executeRaw`
    INSERT INTO zona_piloto (nombre, geometria) VALUES (${ZONA}, ST_GeomFromText(${poligono}, 4326)::geography)`;

  await vaciarRed();
  for (const esquina of ESQUINAS) {
    const { lon, lat } = punto(esquina);
    await prisma.$executeRaw`
      INSERT INTO nodo_peatonal (osm_id, ubicacion)
      VALUES (${osmId(esquina)}, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography)`;
  }
  for (const [a, b] of CUADRAS) {
    await prisma.$executeRaw`
      INSERT INTO tramo_peatonal (nodo_origen_id, nodo_destino_id, geometria, longitud_metros, tipo, tiene_rampa,
                                  costo_base)
      SELECT o.id, d.id, l.linea, l.metros, 'VEREDA', true, l.metros
      FROM nodo_peatonal o
      JOIN nodo_peatonal d ON d.osm_id = ${osmId(b)}
      CROSS JOIN LATERAL (
        SELECT ST_MakeLine(o.ubicacion::geometry, d.ubicacion::geometry)::geography AS linea
      ) g
      CROSS JOIN LATERAL (SELECT g.linea, round(ST_Length(g.linea)::numeric, 2) AS metros) l
      WHERE o.osm_id = ${osmId(a)}`;
  }
});

afterEach(async () => {
  await prisma.$executeRaw`UPDATE tramo_peatonal SET tipo = 'VEREDA', tiene_rampa = true`;
});

afterAll(async () => {
  await borrarReportesDe(vecinos);
  await vaciarRed();
  await prisma.$executeRaw`DELETE FROM zona_piloto WHERE nombre = ${ZONA}`;
});

describe('recorrido sin obstáculos', () => {
  it('devuelve el camino más corto, con su distancia, su tiempo y la traza en GeoJSON', async () => {
    const res = await pedirRecorrido('Silla de ruedas', '00', '20');

    expect(res.status).toBe(200);
    expect(esquinasDe(res.body.geometria)).toEqual(['00', '10', '20']);
    expect(res.body.geometria.type).toBe('LineString');
    expect(res.body.distanciaMetros).toBeGreaterThan(195);
    expect(res.body.distanciaMetros).toBeLessThan(205);
    // A 50 m por minuto.
    expect(res.body.minutosEstimados).toBe(Math.ceil(res.body.distanciaMetros / 50));
  });

  it('recorre cada tramo en el sentido en que se camina, aunque esté cargado al revés', async () => {
    const res = await pedirRecorrido('Silla de ruedas', '20', '00');

    expect(esquinasDe(res.body.geometria)).toEqual(['20', '10', '00']);
  });

  it('acerca el origen y el destino a la esquina más cercana', async () => {
    const cercaDe00 = { lat: punto('00').lat + 0.0002, lon: punto('00').lon + 0.0002 };

    const res = await pedirRecorrido('Silla de ruedas', cercaDe00, '20');

    expect(esquinasDe(res.body.geometria)).toEqual(['00', '10', '20']);
  });
});

describe('un obstáculo cambia el recorrido según el perfil', () => {
  let veredaRota: number;

  beforeAll(async () => {
    // A mitad de la cuadra 10 ─ 20: obstruye solo esa cuadra. Para la silla es intransitable; al coche lo encarece ×2,5.
    veredaRota = await incidenteEn(enGrilla(1.5, 0), 'Vereda rota');
  });

  afterAll(async () => {
    await prisma.incidente.update({ where: { id: veredaRota }, data: { estado: 'RESUELTO' } });
  });

  it('la vereda rota es intransitable para la silla de ruedas: da la vuelta', async () => {
    const res = await pedirRecorrido('Silla de ruedas', '00', '20');

    expect(res.status).toBe(200);
    const esquinas = esquinasDe(res.body.geometria);
    expect(pasaPor(esquinas, '10', '20')).toBe(false);
    expect(res.body.distanciaMetros).toBeGreaterThan(395);
    expect(res.body.distanciaMetros).toBeLessThan(405);
  });

  it('al coche de bebé solo lo encarece: 100 + 250 sigue siendo menos que dar la vuelta', async () => {
    const res = await pedirRecorrido('Coche de bebé', '00', '20');

    expect(esquinasDe(res.body.geometria)).toEqual(['00', '10', '20']);
  });

  const noCuenta: [string, () => Promise<Prisma.IncidenteUncheckedUpdateInput>][] = [
    ['resuelto', async () => ({ estado: 'RESUELTO' })],
    ['desestimado', async () => ({ estado: 'DESESTIMADO' })],
    ['caducado', async () => ({ caducadoEn: new Date() })],
    [
      'vencido aunque la tarea diaria todavía no lo marcó',
      async () => ({ vigenteHasta: new Date(Date.now() - 60_000) }),
    ],
    [
      'unido a otro',
      async () => {
        // El principal queda fuera de la zona: no obstruye nada.
        const principal = await incidenteEn(enGrilla(-5, -5), 'Vereda rota');
        return { incidentePrincipalId: principal };
      },
    ],
  ];

  it.each(noCuenta)('un obstáculo %s no afecta el recorrido', async (_caso, cambios) => {
    const antes = await prisma.incidente.findUniqueOrThrow({ where: { id: veredaRota } });
    await prisma.incidente.update({ where: { id: veredaRota }, data: await cambios() });
    try {
      const res = await pedirRecorrido('Silla de ruedas', '00', '20');

      expect(esquinasDe(res.body.geometria)).toEqual(['00', '10', '20']);
    } finally {
      await prisma.incidente.update({
        where: { id: veredaRota },
        data: {
          estado: antes.estado,
          caducadoEn: antes.caducadoEn,
          vigenteHasta: antes.vigenteHasta,
          incidentePrincipalId: antes.incidentePrincipalId,
        },
      });
    }
  });
});

describe('los atributos del tramo cambian el recorrido según el perfil', () => {
  it('una escalera es intransitable para la silla de ruedas y no para el bastón o andador', async () => {
    await cambiarCuadra('01', '02', Prisma.sql`tipo = 'ESCALERA'`);

    const silla = await pedirRecorrido('Silla de ruedas', '00', '02');
    const baston = await pedirRecorrido('Bastón o andador', '00', '02');

    expect(pasaPor(esquinasDe(silla.body.geometria), '01', '02')).toBe(false);
    expect(silla.body.distanciaMetros).toBeGreaterThan(395);
    // Al bastón la escalera lo encarece ×2: 100 + 200 es menos que los 400 de la vuelta.
    expect(esquinasDe(baston.body.geometria)).toEqual(['00', '01', '02']);
  });

  it('dos cuadras sin rampa encarecen el recorrido de la silla de ruedas: prefiere dar la vuelta', async () => {
    await cambiarCuadra('20', '21', Prisma.sql`tiene_rampa = false`);
    await cambiarCuadra('21', '22', Prisma.sql`tiene_rampa = false`);

    const silla = await pedirRecorrido('Silla de ruedas', '20', '22');
    const baston = await pedirRecorrido('Bastón o andador', '20', '22');

    // Para la silla, ×3: 300 + 300 contra 400 por las cuadras con rampa.
    expect(esquinasDe(silla.body.geometria)).toEqual(['20', '10', '11', '12', '22']);
    // Para el bastón, ×1,5: 150 + 150 sigue siendo menos que 400.
    expect(esquinasDe(baston.body.geometria)).toEqual(['20', '21', '22']);
  });

  it('sin rampa no bloquea: si todas las cuadras son sin rampa, la silla igual llega por la más corta', async () => {
    await prisma.$executeRaw`UPDATE tramo_peatonal SET tiene_rampa = false`;

    const res = await pedirRecorrido('Silla de ruedas', '00', '20');

    expect(res.status).toBe(200);
    expect(esquinasDe(res.body.geometria)).toEqual(['00', '10', '20']);
  });
});

describe('cuando no se puede calcular', () => {
  it('sin camino posible responde 422 "No hay un recorrido transitable"', async () => {
    // En la esquina 22: obstruye las dos cuadras que llegan a ella, y una obra es intransitable para todos.
    const obra = await incidenteEn(punto('22'), 'Obra que interrumpe el paso');
    try {
      const res = await pedirRecorrido('Bastón o andador', '00', '22');

      expect(res.status).toBe(422);
      expect(res.body.error).toEqual({ codigo: 'SIN_RECORRIDO', mensaje: 'No hay un recorrido transitable' });
    } finally {
      await prisma.incidente.update({ where: { id: obra }, data: { estado: 'RESUELTO' } });
    }
  });

  it('con el origen fuera de la zona responde 422 con un mensaje claro', async () => {
    const res = await pedirRecorrido('Silla de ruedas', enGrilla(-3, 0), '20');

    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      codigo: 'FUERA_DE_ZONA',
      mensaje:
        'El origen queda fuera de la zona piloto: por ahora los recorridos se calculan solo dentro de ella',
      detalles: [{ campo: 'origen', mensaje: 'Está fuera de la zona piloto' }],
    });
  });

  it('con los dos puntos fuera de la zona lo dice de los dos', async () => {
    const res = await pedirRecorrido('Silla de ruedas', enGrilla(-3, 0), enGrilla(6, 0));

    expect(res.status).toBe(422);
    expect(res.body.error.mensaje).toMatch(/^El origen y el destino quedan fuera de la zona piloto/);
    expect(res.body.error.detalles.map((d: { campo: string }) => d.campo)).toEqual(['origen', 'destino']);
  });

  it('con el destino dentro de la zona pero lejos de la red responde 422', async () => {
    // A 1,2 cuadras de la esquina 01: unos 120 m, más que ruteo.distancia_max_al_nodo_m.
    const res = await pedirRecorrido('Silla de ruedas', '00', enGrilla(-1.2, 1));

    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('SIN_RED_CERCA');
    expect(res.body.error.mensaje).toBe(
      'No hay ninguna vereda a menos de 100 m del destino: elegí un punto más cerca de una calle',
    );
  });

  it('con el origen y el destino en la misma esquina responde 422', async () => {
    const res = await pedirRecorrido('Silla de ruedas', '11', {
      lat: punto('11').lat + 0.0001,
      lon: punto('11').lon,
    });

    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('MISMO_PUNTO');
  });
});

describe('entrada', () => {
  it('sin sesión responde 401', async () => {
    const res = await request(app)
      .get('/api/recorridos')
      .query({ origen: comoTexto(punto('00')), destino: comoTexto(punto('20')), perfilId: 1 });

    expect(res.status).toBe(401);
  });

  it('valida el formato de los puntos y el perfil', async () => {
    const res = await request(app)
      .get('/api/recorridos')
      .set('Authorization', `Bearer ${token}`)
      .query({ origen: '-38.6', destino: '-91,-68.6', perfilId: 'silla' });

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'origen', mensaje: 'Tiene que ser lat,lon, por ejemplo -38.9590,-68.0870' },
      { campo: 'destino', mensaje: 'Fuera de rango: lat entre -90 y 90, lon entre -180 y 180' },
      { campo: 'perfilId', mensaje: 'No es un id válido' },
    ]);
  });

  it('sin parámetros dice que son obligatorios', async () => {
    const res = await request(app).get('/api/recorridos').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'origen', mensaje: 'Es obligatorio' },
      { campo: 'destino', mensaje: 'Es obligatorio' },
      { campo: 'perfilId', mensaje: 'Es obligatorio' },
    ]);
  });

  it('un perfil que no existe o no está activo responde 400', async () => {
    const inactivo = await prisma.perfilMovilidad.create({
      data: { nombre: `Perfil inactivo ${Date.now()}`, activo: false },
    });
    try {
      for (const perfilId of [inactivo.id, 999_999]) {
        const res = await request(app)
          .get('/api/recorridos')
          .set('Authorization', `Bearer ${token}`)
          .query({ origen: comoTexto(punto('00')), destino: comoTexto(punto('20')), perfilId });

        expect(res.status).toBe(400);
        expect(res.body.error.detalles).toEqual([
          { campo: 'perfilId', mensaje: 'No hay un perfil de movilidad activo con ese id' },
        ]);
      }
    } finally {
      await prisma.perfilMovilidad.delete({ where: { id: inactivo.id } });
    }
  });
});
