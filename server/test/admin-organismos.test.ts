import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearIncidente, crearOrganismoDePrueba, tokenDe } from './apoyo.js';

const listar = (token: string) =>
  request(app).get('/api/admin/organismos').set('Authorization', `Bearer ${token}`);

const crearOrganismo = (activo = true) =>
  prisma.organismo.create({ data: { nombre: 'Organismo de prueba', activo } });

const crearArea = (organismoId: number, nombre: string, activa = true) =>
  prisma.area.create({ data: { organismoId, nombre, activa } });

describe('GET /api/admin/organismos', () => {
  it('lista los organismos activos con sus áreas activas, ordenadas por nombre', async () => {
    const organismo = await crearOrganismo();
    const veredas = await crearArea(organismo.id, 'Veredas');
    const bacheo = await crearArea(organismo.id, 'Bacheo');
    await crearArea(organismo.id, 'Arbolado', false);

    const res = await listar(await tokenDe('ADMINISTRADOR'));

    expect(res.status).toBe(200);
    expect(res.body.organismos).toContainEqual({
      id: organismo.id,
      nombre: 'Organismo de prueba',
      areas: [
        { id: bacheo.id, nombre: 'Bacheo' },
        { id: veredas.id, nombre: 'Veredas' },
      ],
    });
  });

  it('un organismo activo sin áreas activas aparece con la lista vacía', async () => {
    const organismo = await crearOrganismo();
    await crearArea(organismo.id, 'Bacheo', false);

    const res = await listar(await tokenDe('ADMINISTRADOR'));

    expect(res.body.organismos).toContainEqual({
      id: organismo.id,
      nombre: 'Organismo de prueba',
      areas: [],
    });
  });

  it('no incluye los organismos inactivos', async () => {
    const inactivo = await crearOrganismo(false);
    await crearArea(inactivo.id, 'Bacheo');

    const res = await listar(await tokenDe('ADMINISTRADOR'));

    expect(
      res.body.organismos.find((organismo: { id: number }) => organismo.id === inactivo.id),
    ).toBeUndefined();
  });

  it('un vecino o un operador recibe 403, y sin sesión 401', async () => {
    for (const rol of ['VECINO', 'OPERADOR'] as const) {
      const res = await listar(await tokenDe(rol));
      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('SIN_PERMISO');
    }
    expect((await request(app).get('/api/admin/organismos')).status).toBe(401);
  });
});

// --- ABM de organismos y áreas (#165) ---

const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });
const unico = (prefijo: string) => `${prefijo} ${randomUUID()}`;
const admin = () => tokenDe('ADMINISTRADOR');

describe('GET /api/admin/organismos?todos=true', () => {
  it('trae también los inactivos, con todas sus áreas y cuántas categorías activas tiene cada una', async () => {
    const organismo = await prisma.organismo.create({
      data: { nombre: unico('Inactivo'), descripcion: 'Ya no opera', activo: false },
    });
    const area = await crearArea(organismo.id, 'Bacheo', false);
    await prisma.categoria.createMany({
      data: [
        { nombre: unico('Activa'), areaId: area.id },
        { nombre: unico('Inactiva'), areaId: area.id, activa: false },
      ],
    });

    const res = await request(app)
      .get('/api/admin/organismos?todos=true')
      .set(conToken(await admin()));

    expect(res.status).toBe(200);
    expect(res.body.organismos).toContainEqual({
      id: organismo.id,
      nombre: organismo.nombre,
      descripcion: 'Ya no opera',
      activo: false,
      creadoEn: organismo.creadoEn.toISOString(),
      areas: [
        {
          id: area.id,
          nombre: 'Bacheo',
          descripcion: null,
          activa: false,
          creadoEn: area.creadoEn.toISOString(),
          categoriasActivas: 1,
        },
      ],
    });
  });

  it('un valor que no es true ni false da 400', async () => {
    const res = await request(app)
      .get('/api/admin/organismos?todos=quizas')
      .set(conToken(await admin()));
    expect(res.status).toBe(400);
    expect(res.body.error.detalles[0].campo).toBe('todos');
  });
});

describe('POST y PUT /api/admin/organismos', () => {
  it('da de alta un organismo; la descripción vacía queda en null', async () => {
    const nombre = unico('Vialidad');
    const res = await request(app)
      .post('/api/admin/organismos')
      .set(conToken(await admin()))
      .send({ nombre: `  ${nombre}  `, descripcion: '   ' });

    expect(res.status).toBe(201);
    expect(res.body.organismo).toMatchObject({ nombre, descripcion: null, activo: true });
    expect(await prisma.organismo.count({ where: { nombre } })).toBe(1);
  });

  it('sin nombre da 400, y un nombre repetido (sin importar mayúsculas) da 409', async () => {
    const token = await admin();
    const sinNombre = await request(app).post('/api/admin/organismos').set(conToken(token)).send({});
    expect(sinNombre.status).toBe(400);
    expect(sinNombre.body.error.detalles).toContainEqual({ campo: 'nombre', mensaje: 'Es obligatorio' });

    const existente = await prisma.organismo.create({ data: { nombre: unico('Repetido') } });
    const repetido = await request(app)
      .post('/api/admin/organismos')
      .set(conToken(token))
      .send({ nombre: existente.nombre.toUpperCase() });
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.codigo).toBe('NOMBRE_EN_USO');
  });

  it('modifica el nombre y la descripción; dejar el mismo nombre no cuenta como repetido', async () => {
    const organismo = await prisma.organismo.create({ data: { nombre: unico('Original') } });
    const token = await admin();

    const mismoNombre = await request(app)
      .put(`/api/admin/organismos/${organismo.id}`)
      .set(conToken(token))
      .send({ nombre: organismo.nombre, descripcion: 'Detalle' });
    expect(mismoNombre.status).toBe(200);
    expect(mismoNombre.body.organismo).toMatchObject({ descripcion: 'Detalle', activo: true });

    const nuevo = unico('Renombrado');
    const renombrado = await request(app)
      .put(`/api/admin/organismos/${organismo.id}`)
      .set(conToken(token))
      .send({ nombre: nuevo });
    expect(renombrado.body.organismo).toMatchObject({ nombre: nuevo, descripcion: null });
  });

  it('se reactiva con activo: true; con false es la misma baja que DELETE', async () => {
    const organismo = await crearOrganismo(false);
    await crearArea(organismo.id, 'Bacheo');
    const token = await admin();

    const reactivado = await request(app)
      .put(`/api/admin/organismos/${organismo.id}`)
      .set(conToken(token))
      .send({ nombre: organismo.nombre + ' ' + organismo.id, activo: true });
    expect(reactivado.status).toBe(200);
    expect(reactivado.body.organismo.activo).toBe(true);

    const baja = await request(app)
      .put(`/api/admin/organismos/${organismo.id}`)
      .set(conToken(token))
      .send({ nombre: reactivado.body.organismo.nombre, activo: false });
    expect(baja.status).toBe(409);
    expect(baja.body.error.codigo).toBe('ORGANISMO_CON_AREAS_ACTIVAS');
  });

  it('un organismo que no existe da 404', async () => {
    const res = await request(app)
      .put('/api/admin/organismos/999999')
      .set(conToken(await admin()))
      .send({ nombre: unico('Nadie') });
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('ORGANISMO_NO_ENCONTRADO');
  });
});

describe('DELETE /api/admin/organismos/:id', () => {
  it('con áreas activas da 409 y dice cuáles; sin áreas activas lo da de baja sin borrarlo', async () => {
    const organismo = await prisma.organismo.create({ data: { nombre: unico('Con áreas') } });
    const bacheo = await crearArea(organismo.id, 'Bacheo');
    await crearArea(organismo.id, 'Arbolado', false);
    const token = await admin();

    const conAreas = await request(app).delete(`/api/admin/organismos/${organismo.id}`).set(conToken(token));
    expect(conAreas.status).toBe(409);
    expect(conAreas.body.error).toMatchObject({
      codigo: 'ORGANISMO_CON_AREAS_ACTIVAS',
      mensaje: 'Tiene áreas activas (Bacheo): primero hay que darlas de baja',
    });

    await prisma.area.update({ where: { id: bacheo.id }, data: { activa: false } });
    const baja = await request(app).delete(`/api/admin/organismos/${organismo.id}`).set(conToken(token));
    expect(baja.status).toBe(204);
    const guardado = await prisma.organismo.findUnique({ where: { id: organismo.id } });
    expect(guardado?.activo).toBe(false);

    // Ya inactivo: no hace nada.
    expect(
      (await request(app).delete(`/api/admin/organismos/${organismo.id}`).set(conToken(token))).status,
    ).toBe(204);
  });
});

describe('POST y PUT /api/admin/areas', () => {
  it('da de alta un área en un organismo activo', async () => {
    const organismo = await crearOrganismo();
    const res = await request(app)
      .post('/api/admin/areas')
      .set(conToken(await admin()))
      .send({ organismoId: organismo.id, nombre: 'Alumbrado', descripcion: 'Luminarias' });

    expect(res.status).toBe(201);
    expect(res.body.area).toMatchObject({
      organismoId: organismo.id,
      nombre: 'Alumbrado',
      descripcion: 'Luminarias',
      activa: true,
    });
  });

  it('en un organismo inexistente o inactivo da 400', async () => {
    const token = await admin();
    const inexistente = await request(app)
      .post('/api/admin/areas')
      .set(conToken(token))
      .send({ organismoId: 999999, nombre: 'Bacheo' });
    expect(inexistente.status).toBe(400);
    expect(inexistente.body.error.detalles).toEqual([
      { campo: 'organismoId', mensaje: 'No existe ese organismo' },
    ]);

    const inactivo = await crearOrganismo(false);
    const res = await request(app)
      .post('/api/admin/areas')
      .set(conToken(token))
      .send({ organismoId: inactivo.id, nombre: 'Bacheo' });
    expect(res.body.error.detalles).toEqual([
      { campo: 'organismoId', mensaje: 'El organismo está inactivo' },
    ]);
  });

  it('el nombre no se repite dentro del organismo, pero sí en otro', async () => {
    const organismo = await crearOrganismo();
    const otro = await crearOrganismo();
    await crearArea(organismo.id, 'Bacheo');
    const token = await admin();

    const repetida = await request(app)
      .post('/api/admin/areas')
      .set(conToken(token))
      .send({ organismoId: organismo.id, nombre: 'bacheo' });
    expect(repetida.status).toBe(409);
    expect(repetida.body.error.codigo).toBe('NOMBRE_EN_USO');

    const enOtro = await request(app)
      .post('/api/admin/areas')
      .set(conToken(token))
      .send({ organismoId: otro.id, nombre: 'Bacheo' });
    expect(enOtro.status).toBe(201);
  });

  it('modifica un área; no se reactiva si su organismo está inactivo', async () => {
    const organismo = await crearOrganismo();
    const area = await crearArea(organismo.id, 'Bacheo', false);
    const token = await admin();

    const modificada = await request(app)
      .put(`/api/admin/areas/${area.id}`)
      .set(conToken(token))
      .send({ nombre: 'Bacheo y pavimento', descripcion: 'Calles' });
    expect(modificada.status).toBe(200);
    expect(modificada.body.area).toMatchObject({
      nombre: 'Bacheo y pavimento',
      descripcion: 'Calles',
      activa: false,
    });

    await prisma.organismo.update({ where: { id: organismo.id }, data: { activo: false } });
    const reactivar = await request(app)
      .put(`/api/admin/areas/${area.id}`)
      .set(conToken(token))
      .send({ nombre: 'Bacheo y pavimento', activa: true });
    expect(reactivar.status).toBe(409);
    expect(reactivar.body.error.codigo).toBe('ORGANISMO_INACTIVO');
  });

  it('un área que no existe da 404', async () => {
    const res = await request(app)
      .put('/api/admin/areas/999999')
      .set(conToken(await admin()))
      .send({ nombre: 'Nada' });
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('AREA_NO_ENCONTRADA');
  });
});

describe('DELETE /api/admin/areas/:id', () => {
  it('con categorías activas da 409; sin ellas la da de baja y sus incidentes no se tocan', async () => {
    const { organismo, area, categoria } = await crearOrganismoDePrueba();
    const incidenteId = await crearIncidente(categoria.id, { estado: 'DERIVADO' });
    await prisma.incidente.update({ where: { id: incidenteId }, data: { areaId: area.id } });
    const token = await admin();

    const conCategorias = await request(app).delete(`/api/admin/areas/${area.id}`).set(conToken(token));
    expect(conCategorias.status).toBe(409);
    expect(conCategorias.body.error).toMatchObject({
      codigo: 'AREA_CON_CATEGORIAS_ACTIVAS',
      mensaje: `Tiene categorías activas (${categoria.nombre}): primero hay que pasarlas a otra área o darlas de baja`,
    });

    await prisma.categoria.update({ where: { id: categoria.id }, data: { activa: false } });
    expect((await request(app).delete(`/api/admin/areas/${area.id}`).set(conToken(token))).status).toBe(204);

    expect((await prisma.area.findUnique({ where: { id: area.id } }))?.activa).toBe(false);
    expect(await prisma.incidente.findUnique({ where: { id: incidenteId } })).toMatchObject({
      areaId: area.id,
      estado: 'DERIVADO',
    });
    // Ya no se ofrece para dar de alta operadores.
    const lista = await listar(token);
    const suyo = lista.body.organismos.find((o: { id: number }) => o.id === organismo.id);
    expect(suyo.areas).toEqual([]);
    await prisma.incidente.deleteMany({ where: { id: incidenteId } });
  });
});

describe('permisos del ABM de organismos y áreas', () => {
  it('un vecino o un operador recibe 403, y sin sesión 401', async () => {
    const organismo = await crearOrganismo();
    const area = await crearArea(organismo.id, 'Bacheo');
    const pedidos = [
      () =>
        request(app)
          .post('/api/admin/organismos')
          .send({ nombre: unico('X') }),
      () =>
        request(app)
          .put(`/api/admin/organismos/${organismo.id}`)
          .send({ nombre: unico('X') }),
      () => request(app).delete(`/api/admin/organismos/${organismo.id}`),
      () => request(app).post('/api/admin/areas').send({ organismoId: organismo.id, nombre: 'X' }),
      () => request(app).put(`/api/admin/areas/${area.id}`).send({ nombre: 'X' }),
      () => request(app).delete(`/api/admin/areas/${area.id}`),
    ];
    for (const pedido of pedidos) {
      expect((await pedido()).status).toBe(401);
      for (const rol of ['VECINO', 'OPERADOR'] as const) {
        const res = await pedido().set(conToken(await tokenDe(rol)));
        expect(res.status).toBe(403);
      }
    }
    expect((await prisma.area.findUnique({ where: { id: area.id } }))?.activa).toBe(true);
  });
});
