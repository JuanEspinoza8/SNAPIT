import { randomUUID } from 'node:crypto';
import type { TipoVigencia } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { crearUsuario, tokenDe } from './apoyo.js';
import { jpegConExif, png1x1 } from './imagenes.js';

async function crearCategoria(
  opciones: { activa?: boolean; tipoVigencia?: TipoVigencia; diasCaducidad?: number | null } = {},
) {
  const { activa = true, tipoVigencia = 'PERMANENTE', diasCaducidad = null } = opciones;
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  return prisma.categoria.create({
    data: {
      nombre: `Categoría ${randomUUID()}`,
      areaId: area.id,
      activa,
      tipoVigenciaDefault: tipoVigencia,
      diasCaducidadDefault: diasCaducidad,
    },
  });
}

async function vecino() {
  const usuario = await crearUsuario({ rol: 'VECINO' });
  return { usuario, token: crearTokenAcceso(usuario) };
}

const CAMPOS = {
  severidadDeclarada: 'GRAVE',
  descripcion: 'Pozo grande frente a la escuela',
  lat: '-38.951612345',
  lon: '-68.059187654',
  origen: 'APP_MOVIL',
  tomadaConCamaraApp: 'true',
};

/** Arma el POST multipart con los campos de ejemplo, pisando los que se pasen. */
function enviar(
  token: string,
  categoriaId: number,
  opciones: { campos?: Record<string, string | undefined>; foto?: Buffer | null; nombreFoto?: string } = {},
) {
  const { foto = jpegConExif(), nombreFoto = 'foto.jpg' } = opciones;
  let peticion = request(app).post('/api/reportes').set('Authorization', `Bearer ${token}`);
  const campos = { ...CAMPOS, categoriaId: String(categoriaId), ...opciones.campos };
  for (const [campo, valor] of Object.entries(campos)) {
    if (valor !== undefined) peticion = peticion.field(campo, valor);
  }
  if (foto) peticion = peticion.attach('foto', foto, nombreFoto);
  return peticion;
}

const detalleDe = (res: request.Response, campo: string) =>
  res.body.error.detalles.find((d: { campo: string }) => d.campo === campo)?.mensaje;

describe('POST /api/reportes', () => {
  it('crea el reporte, su foto y un incidente REGISTRADO propio', async () => {
    const categoria = await crearCategoria();
    const { usuario, token } = await vecino();

    const res = await enviar(token, categoria.id);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      incidenteId: expect.any(Number),
      nivelConfianza: 0,
      estadoVerificacion: 'PENDIENTE_REVISION',
    });

    const reporte = await prisma.reporte.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { fotografias: true, incidente: true },
    });
    expect(reporte).toMatchObject({
      usuarioId: usuario.id,
      categoriaId: categoria.id,
      severidadDeclarada: 'GRAVE',
      descripcion: 'Pozo grande frente a la escuela',
      origen: 'APP_MOVIL',
    });
    expect(reporte.sincronizadoEn).not.toBeNull();
    expect(reporte.fotografias).toHaveLength(1);
    expect(reporte.fotografias[0]).toMatchObject({
      ancho: 3,
      alto: 2,
      tamanoBytes: jpegConExif().length,
      tomadaConCamaraApp: true,
    });
    expect(reporte.incidente).toMatchObject({
      estado: 'REGISTRADO',
      categoriaId: categoria.id,
      areaId: categoria.areaId,
      severidad: 'GRAVE',
      cantidadReportes: 1,
      tipoVigencia: 'PERMANENTE',
      vigenteHasta: null,
    });
  });

  it('el punto guardado coincide con el enviado, en el reporte y en el incidente', async () => {
    const categoria = await crearCategoria();
    const { token } = await vecino();

    const res = await enviar(token, categoria.id);

    const [punto] = await prisma.$queryRaw<
      { lonReporte: number; latReporte: number; lonIncidente: number; latIncidente: number }[]
    >`
      SELECT ST_X(r.ubicacion::geometry) AS "lonReporte", ST_Y(r.ubicacion::geometry) AS "latReporte",
             ST_X(i.ubicacion::geometry) AS "lonIncidente", ST_Y(i.ubicacion::geometry) AS "latIncidente"
      FROM reporte r JOIN incidente i ON i.id = r.incidente_id
      WHERE r.id = ${res.body.id}`;
    expect(punto).toEqual({
      lonReporte: -68.059187654,
      latReporte: -38.951612345,
      lonIncidente: -68.059187654,
      latIncidente: -38.951612345,
    });
  });

  it('la foto descargada es idéntica byte a byte a la enviada, EXIF incluido', async () => {
    const categoria = await crearCategoria();
    const { token } = await vecino();
    const original = jpegConExif();

    const res = await enviar(token, categoria.id, { foto: original });
    const foto = await prisma.fotografia.findFirstOrThrow({ where: { reporteId: res.body.id } });
    const descarga = await request(app)
      .get(`/api/fotos/${foto.id}`)
      .buffer(true)
      .parse((respuesta, listo) => {
        const partes: Buffer[] = [];
        respuesta.on('data', (parte: Buffer) => partes.push(parte));
        respuesta.on('end', () => listo(null, Buffer.concat(partes)));
      });

    expect(descarga.status).toBe(200);
    expect(descarga.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(descarga.body as Buffer, original)).toBe(0);
    expect((descarga.body as Buffer).includes(Buffer.from('marca-de-prueba-snapit'))).toBe(true);
  });

  it('acepta PNG', async () => {
    const categoria = await crearCategoria();
    const { token } = await vecino();

    const res = await enviar(token, categoria.id, { foto: png1x1, nombreFoto: 'foto.png' });

    expect(res.status).toBe(201);
  });

  it('sin descripción ni fecha de registro, usa null y el momento de llegada', async () => {
    const categoria = await crearCategoria();
    const { token } = await vecino();
    const antes = Date.now();

    const res = await enviar(token, categoria.id, { campos: { descripcion: undefined } });

    const reporte = await prisma.reporte.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(reporte.descripcion).toBeNull();
    expect(reporte.registradoEn.getTime()).toBeGreaterThanOrEqual(antes - 1000);
  });

  it('guarda la fecha en que el vecino lo cargó sin señal', async () => {
    const categoria = await crearCategoria();
    const { token } = await vecino();

    const res = await enviar(token, categoria.id, { campos: { registradoEn: '2026-10-01T09:30:00-03:00' } });

    const reporte = await prisma.reporte.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(reporte.registradoEn.toISOString()).toBe('2026-10-01T12:30:00.000Z');
    expect(reporte.sincronizadoEn!.getTime()).toBeGreaterThan(reporte.registradoEn.getTime());
  });

  it('una categoría temporal deja el incidente con fecha de vencimiento', async () => {
    const categoria = await crearCategoria({ tipoVigencia: 'TEMPORAL', diasCaducidad: 10 });
    const { token } = await vecino();

    const res = await enviar(token, categoria.id, { campos: { registradoEn: '2026-10-01T12:00:00Z' } });

    const incidente = await prisma.incidente.findUniqueOrThrow({ where: { id: res.body.incidenteId } });
    expect(incidente.tipoVigencia).toBe('TEMPORAL');
    expect(incidente.vigenteHasta?.toISOString()).toBe('2026-10-11T12:00:00.000Z');
  });

  describe('datos inválidos → 400 con detalle', () => {
    it('sin foto', async () => {
      const categoria = await crearCategoria();
      const { token } = await vecino();

      const res = await enviar(token, categoria.id, { foto: null });

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('DATOS_INVALIDOS');
      expect(detalleDe(res, 'foto')).toBe('Es obligatoria');
    });

    it('con un archivo que no es JPG ni PNG, aunque se llame .jpg', async () => {
      const categoria = await crearCategoria();
      const { token } = await vecino();

      const res = await enviar(token, categoria.id, { foto: Buffer.from('no soy una imagen') });

      expect(res.status).toBe(400);
      expect(detalleDe(res, 'foto')).toBe('Tiene que ser una imagen JPG o PNG');
    });

    it('con una foto más pesada que FOTO_MAX_MB', async () => {
      const categoria = await crearCategoria();
      const { token } = await vecino();
      const pesada = Buffer.concat([jpegConExif(), Buffer.alloc(1024 * 1024 + 1)]);

      const res = await enviar(token, categoria.id, { foto: pesada });

      expect(res.status).toBe(400);
      expect(detalleDe(res, 'foto')).toBe('Tiene que pesar hasta 1 MB');
    });

    it('con coordenadas fuera de rango', async () => {
      const categoria = await crearCategoria();
      const { token } = await vecino();

      const res = await enviar(token, categoria.id, { campos: { lat: '-91', lon: '181' } });

      expect(res.status).toBe(400);
      expect(detalleDe(res, 'lat')).toBe('Tiene que estar entre -90 y 90');
      expect(detalleDe(res, 'lon')).toBe('Tiene que estar entre -180 y 180');
    });

    it('con coordenadas que no son números', async () => {
      const categoria = await crearCategoria();
      const { token } = await vecino();

      const res = await enviar(token, categoria.id, { campos: { lat: 'abc', lon: undefined } });

      expect(res.status).toBe(400);
      expect(detalleDe(res, 'lat')).toBe('Tiene que ser un número');
      expect(detalleDe(res, 'lon')).toBe('Es obligatorio');
    });

    it('con una categoría inactiva', async () => {
      const categoria = await crearCategoria({ activa: false });
      const { token } = await vecino();

      const res = await enviar(token, categoria.id);

      expect(res.status).toBe(400);
      expect(detalleDe(res, 'categoriaId')).toBe('No existe o no está activa');
    });

    it('con una categoría que no existe', async () => {
      const { token } = await vecino();

      const res = await enviar(token, 999_999_999);

      expect(res.status).toBe(400);
      expect(detalleDe(res, 'categoriaId')).toBe('No existe o no está activa');
    });

    it('con severidad, origen o fecha inválidos', async () => {
      const categoria = await crearCategoria();
      const { token } = await vecino();

      const res = await enviar(token, categoria.id, {
        campos: { severidadDeclarada: 'MUCHA', origen: 'FAX', registradoEn: 'ayer' },
      });

      expect(res.status).toBe(400);
      expect(detalleDe(res, 'severidadDeclarada')).toBeDefined();
      expect(detalleDe(res, 'origen')).toBeDefined();
      expect(detalleDe(res, 'registradoEn')).toBeDefined();
    });

    it('con una fecha de registro futura', async () => {
      const categoria = await crearCategoria();
      const { token } = await vecino();
      const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const res = await enviar(token, categoria.id, { campos: { registradoEn: manana } });

      expect(res.status).toBe(400);
      expect(detalleDe(res, 'registradoEn')).toBe('No puede ser una fecha futura');
    });

    it('sin foto y con otros errores, informa todo junto', async () => {
      const categoria = await crearCategoria();
      const { token } = await vecino();

      const res = await enviar(token, categoria.id, { foto: null, campos: { lat: '200' } });

      expect(detalleDe(res, 'foto')).toBe('Es obligatoria');
      expect(detalleDe(res, 'lat')).toBeDefined();
    });

    it('un reporte rechazado no deja nada en la base', async () => {
      const categoria = await crearCategoria({ activa: false });
      const { usuario, token } = await vecino();

      await enviar(token, categoria.id);

      expect(await prisma.reporte.count({ where: { usuarioId: usuario.id } })).toBe(0);
    });
  });

  it('solo un vecino puede reportar: un operador recibe 403 y sin sesión 401', async () => {
    const categoria = await crearCategoria();

    const operador = await enviar(await tokenDe('OPERADOR'), categoria.id);
    const sinSesion = await request(app).post('/api/reportes').attach('foto', jpegConExif(), 'foto.jpg');

    expect(operador.status).toBe(403);
    expect(sinSesion.status).toBe(401);
  });
});

describe('GET /api/fotos/:id', () => {
  it('una foto que no existe responde 404', async () => {
    const res = await request(app).get('/api/fotos/999999999');

    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('FOTO_NO_ENCONTRADA');
  });
});
