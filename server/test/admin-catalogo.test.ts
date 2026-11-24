import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { claveRegla, REGLAS_TRAMO } from '../src/modulos/recorridos/calculo.js';
import { crearIncidente, crearOrganismoDePrueba, crearUsuario, tokenDe } from './apoyo.js';

const unico = (prefijo: string) => `${prefijo} ${randomUUID()}`;
const admin = async () => ({ Authorization: `Bearer ${await tokenDe('ADMINISTRADOR')}` });

function datosCategoria(areaId: number, cambios: object = {}) {
  return {
    nombre: unico('Categoría'),
    descripcion: 'Para probar',
    areaId,
    tipoVigenciaDefault: 'PERMANENTE',
    pesoSeveridadBase: 1.5,
    ...cambios,
  };
}

const crearCategoria = async (datos: object) =>
  request(app)
    .post('/api/admin/categorias')
    .set(await admin())
    .send(datos);

const crearPerfil = async (datos: object) =>
  request(app)
    .post('/api/admin/perfiles-movilidad')
    .set(await admin())
    .send(datos);

describe('categorías (#166)', () => {
  it('una categoría nueva nace con su fila de la matriz para cada perfil, en factor 1', async () => {
    const { area } = await crearOrganismoDePrueba();
    const perfiles = await prisma.perfilMovilidad.count();

    const res = await crearCategoria(datosCategoria(area.id));

    expect(res.status).toBe(201);
    expect(res.body.categoria).toMatchObject({
      descripcion: 'Para probar',
      area: { id: area.id, activa: true },
      tipoVigenciaDefault: 'PERMANENTE',
      diasCaducidadDefault: null,
      pesoSeveridadBase: 1.5,
      activa: true,
    });
    expect(res.body.categoria.perfiles).toHaveLength(perfiles);
    for (const celda of res.body.categoria.perfiles) {
      expect(celda).toMatchObject({ intransitable: false, factorPenalizacion: 1 });
    }

    const lista = await request(app)
      .get('/api/admin/categorias')
      .set(await admin());
    expect(lista.body.categorias).toContainEqual(res.body.categoria);
  });

  it('valida el peso, la vigencia y el área', async () => {
    const { organismo, area } = await crearOrganismoDePrueba();
    const inactiva = await prisma.area.create({
      data: { organismoId: organismo.id, nombre: unico('Área'), activa: false },
    });

    const peso = await crearCategoria(datosCategoria(area.id, { pesoSeveridadBase: 0 }));
    expect(peso.status).toBe(400);
    expect(peso.body.error.detalles).toContainEqual({
      campo: 'pesoSeveridadBase',
      mensaje: 'Tiene que ser mayor que 0',
    });

    const dias = await crearCategoria(datosCategoria(area.id, { diasCaducidadDefault: 10 }));
    expect(dias.body.error.detalles).toContainEqual({
      campo: 'diasCaducidadDefault',
      mensaje: 'Solo una categoría temporal caduca',
    });

    const temporal = await crearCategoria(
      datosCategoria(area.id, { tipoVigenciaDefault: 'TEMPORAL', diasCaducidadDefault: 10 }),
    );
    expect(temporal.status).toBe(201);

    const areaInactiva = await crearCategoria(datosCategoria(inactiva.id));
    expect(areaInactiva.status).toBe(400);
    expect(areaInactiva.body.error.detalles).toEqual([{ campo: 'areaId', mensaje: 'El área está inactiva' }]);
  });

  it('un nombre repetido, sin importar mayúsculas, da 409', async () => {
    const { area, categoria } = await crearOrganismoDePrueba();

    const res = await crearCategoria(datosCategoria(area.id, { nombre: categoria.nombre.toUpperCase() }));

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('NOMBRE_EN_USO');
  });

  it('cambiar el peso recalcula en el momento la prioridad de sus incidentes abiertos', async () => {
    const { area } = await crearOrganismoDePrueba();
    const datos = datosCategoria(area.id, { pesoSeveridadBase: 0.5 });
    const { body } = await crearCategoria(datos);
    const incidenteId = await crearIncidente(body.categoria.id);
    const cerrado = await crearIncidente(body.categoria.id, { estado: 'RESUELTO' });
    const puntaje = async (id: number) =>
      Number((await prisma.incidente.findUniqueOrThrow({ where: { id } })).puntajePrioridad);

    const primero = await request(app)
      .put(`/api/admin/categorias/${body.categoria.id}`)
      .set(await admin())
      .send({ ...datos, pesoSeveridadBase: 1 });
    expect(primero.status).toBe(200);
    expect(primero.body.prioridadesRecalculadas).toBe(1);
    const conPeso1 = await puntaje(incidenteId);

    await request(app)
      .put(`/api/admin/categorias/${body.categoria.id}`)
      .set(await admin())
      .send({ ...datos, pesoSeveridadBase: 2 });
    expect(await puntaje(incidenteId)).toBeGreaterThan(conPeso1);
    expect(await puntaje(cerrado)).toBe(0);

    // Sin cambiar el peso no se recalcula nada.
    const igual = await request(app)
      .put(`/api/admin/categorias/${body.categoria.id}`)
      .set(await admin())
      .send({ ...datos, pesoSeveridadBase: 2, descripcion: 'Otra' });
    expect(igual.body.prioridadesRecalculadas).toBe(0);
    await prisma.incidente.deleteMany({ where: { id: { in: [incidenteId, cerrado] } } });
  });

  it('cambiar la vigencia no toca la de los incidentes que ya existen', async () => {
    const { area } = await crearOrganismoDePrueba();
    const datos = datosCategoria(area.id);
    const { body } = await crearCategoria(datos);
    const incidenteId = await crearIncidente(body.categoria.id);

    const res = await request(app)
      .put(`/api/admin/categorias/${body.categoria.id}`)
      .set(await admin())
      .send({ ...datos, tipoVigenciaDefault: 'TEMPORAL', diasCaducidadDefault: 5 });

    expect(res.body.categoria).toMatchObject({ tipoVigenciaDefault: 'TEMPORAL', diasCaducidadDefault: 5 });
    expect(
      (await prisma.incidente.findUniqueOrThrow({ where: { id: incidenteId } })).vigenteHasta,
    ).toBeNull();
    await prisma.incidente.deleteMany({ where: { id: incidenteId } });
  });

  it('la baja es lógica: deja de ofrecerse al reportar y sus incidentes quedan', async () => {
    const { categoria } = await crearOrganismoDePrueba();
    const incidenteId = await crearIncidente(categoria.id);

    const res = await request(app)
      .delete(`/api/admin/categorias/${categoria.id}`)
      .set(await admin());

    expect(res.status).toBe(204);
    expect((await prisma.categoria.findUniqueOrThrow({ where: { id: categoria.id } })).activa).toBe(false);
    const publicas = await request(app).get('/api/categorias');
    expect(publicas.body.categorias.find((c: { id: number }) => c.id === categoria.id)).toBeUndefined();
    expect(await prisma.incidente.findUnique({ where: { id: incidenteId } })).not.toBeNull();
    await prisma.incidente.deleteMany({ where: { id: incidenteId } });
  });

  it('se reactiva con activa: true, pero no en un área inactiva', async () => {
    const { area, categoria } = await crearOrganismoDePrueba();
    await prisma.categoria.update({ where: { id: categoria.id }, data: { activa: false } });
    await prisma.area.update({ where: { id: area.id }, data: { activa: false } });
    const datos = datosCategoria(area.id, { nombre: categoria.nombre, activa: true });

    const conAreaInactiva = await request(app)
      .put(`/api/admin/categorias/${categoria.id}`)
      .set(await admin())
      .send(datos);
    expect(conAreaInactiva.status).toBe(400);

    await prisma.area.update({ where: { id: area.id }, data: { activa: true } });
    const reactivada = await request(app)
      .put(`/api/admin/categorias/${categoria.id}`)
      .set(await admin())
      .send(datos);
    expect(reactivada.body.categoria.activa).toBe(true);
  });

  it('una categoría que no existe da 404', async () => {
    const { area } = await crearOrganismoDePrueba();
    const res = await request(app)
      .put('/api/admin/categorias/999999')
      .set(await admin())
      .send(datosCategoria(area.id));
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('CATEGORIA_NO_ENCONTRADA');
  });
});

describe('PUT /api/admin/categorias/:id/perfiles (la matriz)', () => {
  // La base de tests puede no tener perfiles (en la CI no se corre la semilla): se crean dos propios.
  beforeAll(async () => {
    await crearPerfil({ nombre: unico('Perfil') });
    await crearPerfil({ nombre: unico('Perfil') });
  });

  it('cambia las celdas que vienen y deja las demás', async () => {
    const { area } = await crearOrganismoDePrueba();
    const { body } = await crearCategoria(datosCategoria(area.id));
    const [uno, dos] = body.categoria.perfiles as { perfilMovilidadId: number }[];

    const res = await request(app)
      .put(`/api/admin/categorias/${body.categoria.id}/perfiles`)
      .set(await admin())
      .send({
        perfiles: [
          { perfilMovilidadId: uno!.perfilMovilidadId, intransitable: true, factorPenalizacion: 2.5 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.perfiles).toContainEqual(
      expect.objectContaining({
        perfilMovilidadId: uno!.perfilMovilidadId,
        intransitable: true,
        factorPenalizacion: 2.5,
      }),
    );
    expect(res.body.perfiles).toContainEqual(
      expect.objectContaining({
        perfilMovilidadId: dos!.perfilMovilidadId,
        intransitable: false,
        factorPenalizacion: 1,
      }),
    );
  });

  it('un factor de penalización ≤ 0, un perfil que no existe o uno repetido dan 400', async () => {
    const { area } = await crearOrganismoDePrueba();
    const { body } = await crearCategoria(datosCategoria(area.id));
    const perfilId = body.categoria.perfiles[0].perfilMovilidadId;
    const guardar = async (perfiles: object[]) =>
      request(app)
        .put(`/api/admin/categorias/${body.categoria.id}/perfiles`)
        .set(await admin())
        .send({ perfiles });

    for (const factorPenalizacion of [0, -1]) {
      const res = await guardar([{ perfilMovilidadId: perfilId, intransitable: false, factorPenalizacion }]);
      expect(res.status).toBe(400);
      expect(res.body.error.detalles).toEqual([
        { campo: 'perfiles.0.factorPenalizacion', mensaje: 'Tiene que ser mayor que 0' },
      ]);
    }
    const inexistente = await guardar([
      { perfilMovilidadId: 999999, intransitable: false, factorPenalizacion: 1 },
    ]);
    expect(inexistente.body.error.detalles).toEqual([
      { campo: 'perfiles.0.perfilMovilidadId', mensaje: 'No existe ese perfil' },
    ]);
    const celda = { perfilMovilidadId: perfilId, intransitable: false, factorPenalizacion: 1 };
    expect((await guardar([celda, celda])).status).toBe(400);
  });
});

describe('perfiles de movilidad (#166)', () => {
  it('un perfil nuevo nace con su fila para cada categoría y sus reglas de tramo en factor 1', async () => {
    const nombre = unico('Perfil');
    const categorias = await prisma.categoria.count();

    const res = await crearPerfil({ nombre, descripcion: 'Muletas' });

    expect(res.status).toBe(201);
    const perfil = res.body.perfil;
    expect(perfil).toMatchObject({ nombre, descripcion: 'Muletas', activo: true });
    expect(perfil.reglas).toEqual(
      REGLAS_TRAMO.map((regla) => ({ regla, clave: claveRegla(regla, perfil.id), valor: '1.0' })),
    );
    expect(await prisma.categoriaPerfil.count({ where: { perfilMovilidadId: perfil.id } })).toBe(categorias);
    const regla = await prisma.parametroSistema.findUniqueOrThrow({
      where: { clave: perfil.reglas[0].clave },
    });
    expect(regla).toMatchObject({ tipo: 'factor', descripcion: expect.stringContaining(nombre) });

    const lista = await request(app)
      .get('/api/admin/perfiles-movilidad')
      .set(await admin());
    expect(lista.body.perfiles).toContainEqual(perfil);
  });

  it('un nombre repetido da 409', async () => {
    const nombre = unico('Perfil');
    await crearPerfil({ nombre });
    const res = await crearPerfil({ nombre: nombre.toLowerCase() });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('NOMBRE_EN_USO');
  });

  it('renombrarlo actualiza la descripción de sus reglas', async () => {
    const { body } = await crearPerfil({ nombre: unico('Perfil') });
    const nuevo = unico('Renombrado');

    const res = await request(app)
      .put(`/api/admin/perfiles-movilidad/${body.perfil.id}`)
      .set(await admin())
      .send({ nombre: nuevo });

    expect(res.body.perfil.nombre).toBe(nuevo);
    const regla = await prisma.parametroSistema.findUniqueOrThrow({
      where: { clave: body.perfil.reglas[0].clave },
    });
    expect(regla.descripcion).toContain(nuevo);
  });

  it('dado de baja, no se ofrece en los recorridos (400) y quien lo tenía queda sin perfil', async () => {
    const { body } = await crearPerfil({ nombre: unico('Perfil') });
    const vecino = await crearUsuario();
    await prisma.usuario.update({ where: { id: vecino.id }, data: { perfilMovilidadId: body.perfil.id } });

    const baja = await request(app)
      .delete(`/api/admin/perfiles-movilidad/${body.perfil.id}`)
      .set(await admin());

    expect(baja.status).toBe(204);
    expect((await prisma.perfilMovilidad.findUniqueOrThrow({ where: { id: body.perfil.id } })).activo).toBe(
      false,
    );
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { id: vecino.id } })).perfilMovilidadId,
    ).toBeNull();
    const recorrido = await request(app)
      .get('/api/recorridos')
      .set('Authorization', `Bearer ${await tokenDe('VECINO')}`)
      .query({ origen: '-38.95,-68.06', destino: '-38.951,-68.061', perfilId: body.perfil.id });
    expect(recorrido.status).toBe(400);
    expect(recorrido.body.error.detalles[0].campo).toBe('perfilId');
    const publicos = await request(app).get('/api/perfiles-movilidad');
    expect(publicos.body.perfiles.find((p: { id: number }) => p.id === body.perfil.id)).toBeUndefined();

    const reactivado = await request(app)
      .put(`/api/admin/perfiles-movilidad/${body.perfil.id}`)
      .set(await admin())
      .send({ nombre: body.perfil.nombre, activo: true });
    expect(reactivado.body.perfil.activo).toBe(true);
  });
});

describe('permisos de categorías y perfiles', () => {
  it('un vecino o un operador recibe 403, y sin sesión 401', async () => {
    const rutas = ['/api/admin/categorias', '/api/admin/perfiles-movilidad'];
    for (const ruta of rutas) {
      expect((await request(app).get(ruta)).status).toBe(401);
      expect((await request(app).post(ruta).send({})).status).toBe(401);
      for (const rol of ['VECINO', 'OPERADOR'] as const) {
        const res = await request(app)
          .post(ruta)
          .set('Authorization', `Bearer ${await tokenDe(rol)}`)
          .send({});
        expect(res.status).toBe(403);
      }
    }
  });
});
