import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';

// Nombres únicos: categoria y perfil_movilidad tienen el nombre único y los tests corren en paralelo.
const nombreNuevo = (prefijo: string) => `${prefijo} ${randomUUID()}`;

async function crearArea() {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  return prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
}

describe('GET /api/categorias', () => {
  it('es pública y devuelve las categorías activas con su área, sin datos internos', async () => {
    const area = await crearArea();
    const categoria = await prisma.categoria.create({
      data: {
        nombre: nombreNuevo('Pozo'),
        descripcion: 'Un pozo de prueba',
        areaId: area.id,
        tipoVigenciaDefault: 'TEMPORAL',
        diasCaducidadDefault: 10,
        pesoSeveridadBase: '1.75',
      },
    });

    const res = await request(app).get('/api/categorias');

    expect(res.status).toBe(200);
    expect(res.body.categorias).toContainEqual({
      id: categoria.id,
      nombre: categoria.nombre,
      descripcion: 'Un pozo de prueba',
      tipoVigencia: 'TEMPORAL',
      area: { id: area.id, nombre: 'Área de prueba' },
    });
  });

  it('una categoría inactiva no aparece', async () => {
    const area = await crearArea();
    const inactiva = await prisma.categoria.create({
      data: { nombre: nombreNuevo('Inactiva'), areaId: area.id, activa: false },
    });

    const res = await request(app).get('/api/categorias');

    expect(res.body.categorias.map((c: { id: number }) => c.id)).not.toContain(inactiva.id);
  });
});

describe('GET /api/perfiles-movilidad', () => {
  it('es pública y devuelve los perfiles activos', async () => {
    const perfil = await prisma.perfilMovilidad.create({
      data: { nombre: nombreNuevo('Silla'), descripcion: 'Perfil de prueba' },
    });

    const res = await request(app).get('/api/perfiles-movilidad');

    expect(res.status).toBe(200);
    expect(res.body.perfiles).toContainEqual({
      id: perfil.id,
      nombre: perfil.nombre,
      descripcion: 'Perfil de prueba',
    });
  });

  it('un perfil inactivo no aparece', async () => {
    const inactivo = await prisma.perfilMovilidad.create({
      data: { nombre: nombreNuevo('Inactivo'), activo: false },
    });

    const res = await request(app).get('/api/perfiles-movilidad');

    expect(res.body.perfiles.map((p: { id: number }) => p.id)).not.toContain(inactivo.id);
  });
});
