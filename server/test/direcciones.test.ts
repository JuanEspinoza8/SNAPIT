import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/compartido/prisma.js';
import { crearTokenAcceso } from '../src/modulos/auth/tokens.js';
import type { DireccionNominatim } from '../src/modulos/geocodificacion/calculo.js';
import { nominatim } from '../src/modulos/geocodificacion/nominatim.js';
import { reintentarPendientes } from '../src/modulos/geocodificacion/servicio.js';
import { borrarReportesDe, crearUsuario } from './apoyo.js';
import { jpegConExif } from './imagenes.js';

// Nominatim simulado: cada test decide qué contesta.
vi.mock('../src/modulos/geocodificacion/nominatim.js', () => ({ nominatim: { direccionDe: vi.fn() } }));
const direccionDe = vi.mocked(nominatim.direccionDe);

beforeEach(() => {
  direccionDe.mockReset();
});

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

async function preparar() {
  const organismo = await prisma.organismo.create({ data: { nombre: 'Organismo de prueba' } });
  const area = await prisma.area.create({ data: { organismoId: organismo.id, nombre: 'Área de prueba' } });
  const categoria = await prisma.categoria.create({
    data: { nombre: `Categoría ${randomUUID()}`, areaId: area.id },
  });
  const usuario = await crearUsuario({ rol: 'VECINO' });
  vecinos.push(usuario.id);
  const token = crearTokenAcceso(usuario);

  const enviar = () =>
    request(app)
      .post('/api/reportes')
      .set('Authorization', `Bearer ${token}`)
      .field('categoriaId', String(categoria.id))
      .field('severidadDeclarada', 'LEVE')
      .field('lat', '-38.9516')
      .field('lon', '-68.0591')
      .field('origen', 'SITIO_WEB')
      .attach('foto', jpegConExif(), 'foto.jpg');
  return { enviar };
}

/** Una respuesta de Nominatim que llega cuando el test la suelta. */
function respuestaEnEspera() {
  let soltar!: (direccion: DireccionNominatim | null) => void;
  direccionDe.mockReturnValueOnce(new Promise((resolver) => (soltar = resolver)));
  return (direccion: DireccionNominatim | null) => soltar(direccion);
}

async function direcciones(reporteId: number) {
  const reporte = await prisma.reporte.findUniqueOrThrow({
    where: { id: reporteId },
    select: { direccion: true, incidente: { select: { direccion: true } } },
  });
  return { reporte: reporte.direccion, incidente: reporte.incidente?.direccion };
}

// Cada vuelta consulta la base mientras se guarda la dirección: si hace falta abrir otra conexión, en
// Windows puede tardar más que el segundo que espera vi.waitFor por defecto.
const esperarA = (comprobar: () => Promise<void>) => vi.waitFor(comprobar, { timeout: 5000, interval: 100 });

/** Simula que el reporte llegó hace rato: la tarea de pendientes solo toma los de más de 2 minutos. */
const envejecer = (reporteId: number) =>
  prisma.$executeRaw`UPDATE reporte SET creado_en = '2000-01-01T00:00:00Z' WHERE id = ${reporteId}`;

describe('dirección y barrio de un reporte nuevo', () => {
  it('responde sin esperar a Nominatim y después guarda la dirección en el reporte y en el incidente', async () => {
    const { enviar } = await preparar();
    const soltar = respuestaEnEspera();

    const res = await enviar();

    // Nominatim todavía no contestó y el vecino ya tiene su respuesta.
    expect(res.status).toBe(201);
    expect(direccionDe).toHaveBeenCalledWith(-38.9516, -68.0591);
    expect(await direcciones(res.body.id)).toEqual({ reporte: null, incidente: null });

    soltar({ road: 'Avenida Argentina', house_number: '250', suburb: 'Área Centro Este' });

    const esperada = 'Avenida Argentina 250, Área Centro Este';
    await esperarA(async () => {
      expect(await direcciones(res.body.id)).toEqual({ reporte: esperada, incidente: esperada });
    });
  });

  it('si el incidente ya tiene dirección, no se la pisa', async () => {
    const { enviar } = await preparar();
    const soltar = respuestaEnEspera();
    const res = await enviar();
    await prisma.incidente.update({
      where: { id: res.body.incidenteId },
      data: { direccion: 'Mitre 100, Centro' },
    });

    soltar({ road: 'Lanín', city_district: 'Valentina Sur Rural' });

    await esperarA(async () => {
      expect(await direcciones(res.body.id)).toEqual({
        reporte: 'Lanín, Valentina Sur Rural',
        incidente: 'Mitre 100, Centro',
      });
    });
  });

  it('si Nominatim no tiene nada cerca, queda "Sin barrio"', async () => {
    const { enviar } = await preparar();
    direccionDe.mockResolvedValueOnce(null);

    const res = await enviar();

    await esperarA(async () => {
      expect(await direcciones(res.body.id)).toEqual({ reporte: 'Sin barrio', incidente: 'Sin barrio' });
    });
  });

  it('si Nominatim falla, el reporte queda igual y la dirección se completa más tarde', async () => {
    const { enviar } = await preparar();
    direccionDe.mockRejectedValueOnce(new Error('Nominatim no responde'));

    const res = await enviar();

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(direccionDe).toHaveBeenCalledTimes(1));
    const reporte = await prisma.reporte.findUniqueOrThrow({
      where: { id: res.body.id },
      select: { direccion: true, estadoVerificacion: true, incidenteId: true },
    });
    expect(reporte).toEqual({
      direccion: null,
      estadoVerificacion: 'PENDIENTE_REVISION',
      incidenteId: res.body.incidenteId,
    });

    await envejecer(res.body.id);
    direccionDe.mockResolvedValue({ road: 'Lago Huechulafquen', suburb: 'Villa Ceferino' });
    await reintentarPendientes();

    expect(await direcciones(res.body.id)).toEqual({
      reporte: 'Lago Huechulafquen, Villa Ceferino',
      incidente: 'Lago Huechulafquen, Villa Ceferino',
    });
  });

  it('los reportes recién llegados no se reintentan: su primer intento todavía está en camino', async () => {
    const { enviar } = await preparar();
    const soltar = respuestaEnEspera();
    const res = await enviar();
    direccionDe.mockResolvedValue({ road: 'Otra', suburb: 'Otro' });

    await reintentarPendientes();

    expect(await direcciones(res.body.id)).toEqual({ reporte: null, incidente: null });
    soltar({ road: 'Avenida Olascoaga', suburb: 'Área Centro Oeste' });
    await esperarA(async () => {
      expect((await direcciones(res.body.id)).reporte).toBe('Avenida Olascoaga, Área Centro Oeste');
    });
  });

  it('una vuelta de reintentos corta en la primera falla, para no insistirle a un servicio caído', async () => {
    const { enviar } = await preparar();
    direccionDe.mockRejectedValue(new Error('Nominatim no responde'));
    const primero = await enviar();
    const segundo = await enviar();
    await vi.waitFor(() => expect(direccionDe).toHaveBeenCalledTimes(2));
    await envejecer(primero.body.id);
    await envejecer(segundo.body.id);
    direccionDe.mockClear();

    const resultado = await reintentarPendientes();

    expect(direccionDe).toHaveBeenCalledTimes(1);
    expect(resultado.completados).toBe(0);
    expect(resultado.pendientes).toBeGreaterThanOrEqual(2);
    expect(await direcciones(primero.body.id)).toEqual({ reporte: null, incidente: null });
    expect(await direcciones(segundo.body.id)).toEqual({ reporte: null, incidente: null });
  });
});
