import sharp from 'sharp';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { almacenFotos } from '../src/compartido/almacenFotos.js';
import { prisma } from '../src/compartido/prisma.js';
import { comprimirFotosGuardadas } from '../src/tareas/compresionFotos.js';
import { borrarReportesDe, crearOrganismoDePrueba, reportarEn } from './apoyo.js';
import { fotoUnica, jpegConExif } from './imagenes.js';

vi.mock('../src/modulos/geocodificacion/servicio.js', () => ({ completarDireccionSinEsperar: vi.fn() }));

const vecinos: number[] = [];
afterAll(() => borrarReportesDe(vecinos));

/** Una foto como se guardaban antes: el JPG original, tal como llegó. */
async function fotoVieja() {
  const { categoria } = await crearOrganismoDePrueba();
  const reporte = await reportarEn(
    { lat: -38.7 - Math.random() * 0.05, lon: -68.3 - Math.random() * 0.05 },
    { categoriaId: categoria.id, pendiente: true },
  );
  vecinos.push(reporte.vecinoId);
  const original = await fotoUnica(jpegConExif());
  const ruta = await almacenFotos.guardar(original, 'jpg');
  const foto = await prisma.fotografia.findFirstOrThrow({ where: { reporteId: reporte.id } });
  await prisma.fotografia.update({
    where: { id: foto.id },
    data: { rutaArchivo: ruta, tamanoBytes: original.length },
  });
  return { foto, ruta, original };
}

describe('comprimir las fotos ya guardadas', () => {
  it('pasa una foto vieja a WebP, actualiza su fila y borra el original', async () => {
    const { foto, ruta, original } = await fotoVieja();

    const resumen = await comprimirFotosGuardadas({ ids: [foto.id] });

    expect(resumen).toMatchObject({ fotos: 1, comprimidas: 1, fallidas: 0, bytesAntes: original.length });
    const nueva = await prisma.fotografia.findUniqueOrThrow({ where: { id: foto.id } });
    expect(nueva.rutaArchivo).toMatch(/\.webp$/);
    expect(nueva.tamanoBytes).toBe(resumen.bytesDespues);
    const guardada = await almacenFotos.leer(nueva.rutaArchivo);
    expect((await sharp(guardada!).metadata()).format).toBe('webp');
    expect(await almacenFotos.leer(ruta)).toBeNull();
    // Lo que se leyó de la foto al recibirla no cambia.
    expect(nueva.exifModelo).toBe(foto.exifModelo);
    expect(nueva.hashPerceptual).toBe(foto.hashPerceptual);
  });

  it('para probar, cuenta cuánto se ahorraría sin cambiar nada', async () => {
    const { foto, ruta } = await fotoVieja();

    const resumen = await comprimirFotosGuardadas({ ids: [foto.id], probar: true });

    expect(resumen).toMatchObject({ fotos: 1, comprimidas: 0, fallidas: 0 });
    expect(resumen.bytesDespues).toBeLessThan(resumen.bytesAntes);
    expect((await prisma.fotografia.findUniqueOrThrow({ where: { id: foto.id } })).rutaArchivo).toBe(ruta);
  });

  it('si el archivo no está, la cuenta como fallida y sigue', async () => {
    const { foto, ruta } = await fotoVieja();
    await almacenFotos.borrar(ruta);

    const resumen = await comprimirFotosGuardadas({ ids: [foto.id] });

    expect(resumen).toMatchObject({ fotos: 1, comprimidas: 0, fallidas: 1 });
  });

  it('las que ya están en WebP no se tocan', async () => {
    const { categoria } = await crearOrganismoDePrueba();
    const reporte = await reportarEn(
      { lat: -38.7 - Math.random() * 0.05, lon: -68.3 - Math.random() * 0.05 },
      { categoriaId: categoria.id, pendiente: true },
    );
    vecinos.push(reporte.vecinoId);
    const foto = await prisma.fotografia.findFirstOrThrow({ where: { reporteId: reporte.id } });

    expect(await comprimirFotosGuardadas({ ids: [foto.id] })).toMatchObject({ fotos: 0 });
  });
});
