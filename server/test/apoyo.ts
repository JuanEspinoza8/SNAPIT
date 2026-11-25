import { randomUUID } from 'node:crypto';
import type { EstadoIncidente, RolUsuario, Severidad } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../src/app.js';
import { almacenFotos } from '../src/compartido/almacenFotos.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import { avisarCambioIncidente } from '../src/modulos/incidentes/eventos.js';
import { transaccion } from '../src/modulos/reportes/repositorio.js';
import { cambiarEstadoReporte } from '../src/modulos/verificacion/repositorio.js';
import { aplicarResultado } from '../src/modulos/verificacion/resultado.js';
import { fotoUnica, jpegSinExif } from './imagenes.js';

export const CLAVE = 'clave-de-prueba-1';

// Cada test usa un correo distinto, así pueden correr en paralelo sobre la misma base.
export const correoNuevo = () => `prueba-${randomUUID()}@snapit.test`;

export async function crearUsuario(
  opciones: {
    rol?: RolUsuario;
    confirmado?: boolean;
    dadoDeBaja?: boolean;
    organismoId?: number | null;
    areaId?: number | null;
  } = {},
) {
  const {
    rol = 'VECINO',
    confirmado = true,
    dadoDeBaja = false,
    organismoId = null,
    areaId = null,
  } = opciones;
  return prisma.usuario.create({
    data: {
      email: correoNuevo(),
      nombre: 'Persona de prueba',
      passwordHash: await bcrypt.hash(CLAVE, 4),
      rol,
      organismoId,
      areaId,
      emailVerificadoEn: confirmado ? new Date() : null,
      eliminadoEn: dadoDeBaja ? new Date() : null,
    },
  });
}

/** Token de acceso de un usuario nuevo con ese rol. */
export async function tokenDe(rol: RolUsuario) {
  return crearTokenAcceso(await crearUsuario({ rol }));
}

export async function ingresar(email: string, clave = CLAVE) {
  return request(app).post('/api/auth/ingreso').send({ email, clave });
}

/**
 * Borra los reportes de estos usuarios, sus fotos (filas y archivos) y los incidentes que abrieron.
 * La base de tests se reutiliza entre corridas: así no se acumulan incidentes en Neuquén.
 */
export async function borrarReportesDe(usuarioIds: number[]) {
  const reportes = await prisma.reporte.findMany({
    where: { usuarioId: { in: usuarioIds } },
    select: { incidenteId: true, fotografias: { select: { rutaArchivo: true } } },
  });
  await Promise.all(reportes.flatMap((r) => r.fotografias.map((f) => almacenFotos.borrar(f.rutaArchivo))));
  await prisma.reporte.deleteMany({ where: { usuarioId: { in: usuarioIds } } });
  const incidentes = reportes.flatMap((r) => (r.incidenteId === null ? [] : [r.incidenteId]));
  await prisma.incidente.deleteMany({ where: { id: { in: incidentes } } });
}

/**
 * Los días de vigencia de un temporal cuya categoría no los define. En una base nueva la semilla corre al
 * final, así que el parámetro puede faltar: entonces son 30.
 */
export async function diasVigenciaPorDefecto() {
  const parametro = await prisma.parametroSistema.findUnique({ where: { clave: 'vigencia.dias_default' } });
  return parametro ? Number(parametro.valor) : 30;
}

/** Un organismo nuevo con un área y una categoría de esa área: así los tests no ven los incidentes de otros. */
export async function crearOrganismoDePrueba(pesoSeveridadBase = '1.00') {
  const organismo = await prisma.organismo.create({ data: { nombre: `Organismo ${randomUUID()}` } });
  const area = await prisma.area.create({
    data: { organismoId: organismo.id, nombre: `Área ${randomUUID()}` },
  });
  const categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id, pesoSeveridadBase },
  });
  return { organismo, area, categoria };
}

/**
 * Un incidente sin reportes, insertado directo en la base, lejos de Neuquén (0, 0) para no cruzarse con los de
 * otros tests. Se borra con prisma.incidente.deleteMany; sus seguimientos y avisos se van con él.
 */
export async function crearIncidente(
  categoriaId: number,
  {
    estado = 'VERIFICADO',
    principalId = null,
  }: { estado?: EstadoIncidente; principalId?: number | null } = {},
) {
  const [fila] = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO incidente (categoria_id, estado, ubicacion, incidente_principal_id)
    VALUES (${categoriaId}, ${estado}::estado_incidente, ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography,
            ${principalId})
    RETURNING id`;
  return fila!.id;
}

/**
 * Verifica un reporte pendiente como lo haría la verificación con IA o un operador, sin pasar por ellos: el
 * reporte queda VERIFICADO con todo su efecto (reputación, incidente, bitácora y prioridad).
 */
export async function verificarReporte(reporteId: number) {
  await transaccion(async (tx) => {
    await cambiarEstadoReporte(tx, reporteId, 'VERIFICADO');
    const efecto = await aplicarResultado(tx, {
      reporteId,
      decision: 'VERIFICADO',
      operadorId: null,
      comentario: null,
    });
    if (efecto.incidente) await avisarCambioIncidente(tx, efecto.incidente.id);
  });
}

/**
 * Deja un incidente verificado como VERIFICADO sin derivar, directo en la base: al verificarse, se deriva solo al
 * área de su categoría. Así queda como uno de antes de la derivación automática (o con el área de su categoría
 * dada de baja), para los tests que prueban lo que hace el operador con un incidente sin derivar.
 */
export async function dejarSinDerivar(incidenteId: number) {
  await prisma.movimientoIncidente.deleteMany({ where: { incidenteId, tipo: 'DERIVACION' } });
  await prisma.incidente.update({ where: { id: incidenteId }, data: { estado: 'VERIFICADO', areaId: null } });
}

/**
 * Un reporte de un vecino nuevo en ese punto. Todo reporte llega pendiente; salvo con `pendiente`, se verifica
 * enseguida (verificarReporte) y su incidente queda DERIVADO al área de su categoría. Con `pendiente` el
 * incidente sigue REGISTRADO.
 * Los tests que lo usan simulan la geocodificación.
 */
export async function reportarEn(
  punto: { lat: number; lon: number },
  opciones: { categoriaId: number; severidad?: Severidad; pendiente?: boolean },
) {
  const vecino = await crearUsuario({ rol: 'VECINO' });
  const res = await request(app)
    .post('/api/reportes')
    .set('Authorization', `Bearer ${crearTokenAcceso(vecino)}`)
    .field('categoriaId', String(opciones.categoriaId))
    .field('severidadDeclarada', opciones.severidad ?? 'MODERADA')
    .field('lat', String(punto.lat))
    .field('lon', String(punto.lon))
    .field('origen', 'APP_MOVIL')
    .field('tomadaConCamaraApp', String(!opciones.pendiente))
    .attach('foto', await fotoUnica(jpegSinExif()), 'foto.jpg');
  if (res.status !== 201) throw new Error(`El reporte no se creó: ${res.status} ${JSON.stringify(res.body)}`);
  if (!opciones.pendiente) await verificarReporte(res.body.id as number);
  return { id: res.body.id as number, incidenteId: res.body.incidenteId as number, vecinoId: vecino.id };
}
