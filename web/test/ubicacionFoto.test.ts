import { describe, expect, it } from 'vitest';
import { leerUbicacion, ubicacionDeLaFoto } from '../src/compartido/ubicacionFoto.js';
import { heicConGps, jpegConGps, jpegSinGps } from './jpegConGps.js';

const vista = (bytes: Uint8Array) => new DataView(bytes.buffer);

describe('ubicación de la foto (EXIF)', () => {
  it('lee la latitud y la longitud, con el signo de su referencia (S y W)', () => {
    const punto = leerUbicacion(vista(jpegConGps({ lat: -38.951667, lon: -68.059167 })));

    expect(punto?.lat).toBeCloseTo(-38.951667, 4);
    expect(punto?.lon).toBeCloseTo(-68.059167, 4);
  });

  it('lee el EXIF en cualquiera de los dos órdenes de bytes', () => {
    const punto = leerUbicacion(vista(jpegConGps({ lat: 40.4168, lon: 3.7038 }, { intel: true })));

    expect(punto?.lat).toBeCloseTo(40.4168, 4);
    expect(punto?.lon).toBeCloseTo(3.7038, 4);
  });

  it('acepta la referencia en minúscula, como el servidor', () => {
    const punto = leerUbicacion(
      vista(jpegConGps({ lat: 38.95, lon: 68.06 }, { referencias: { lat: 's', lon: 'w' } })),
    );

    expect(punto?.lat).toBeCloseTo(-38.95, 4);
    expect(punto?.lon).toBeCloseTo(-68.06, 4);
  });

  it('sin el hemisferio (falta la referencia o no es N/S y E/W) no hay ubicación: no se supone N ni E', () => {
    const punto = { lat: 38.95, lon: 68.06 };

    expect(leerUbicacion(vista(jpegConGps(punto, { referencias: { lat: '' } })))).toBeNull();
    expect(leerUbicacion(vista(jpegConGps(punto, { referencias: { lon: '' } })))).toBeNull();
    expect(leerUbicacion(vista(jpegConGps(punto, { referencias: { lat: 'X' } })))).toBeNull();
    expect(leerUbicacion(vista(jpegConGps(punto, { referencias: { lon: 'O' } })))).toBeNull();
    // Con las dos referencias, el mismo punto sí se lee.
    expect(leerUbicacion(vista(jpegConGps(punto, { referencias: { lat: 'N', lon: 'E' } })))?.lat).toBeCloseTo(
      38.95,
      4,
    );
  });

  it('sin EXIF, con 0, 0 o si no es un JPEG, no hay ubicación', () => {
    expect(leerUbicacion(vista(jpegSinGps()))).toBeNull();
    expect(leerUbicacion(vista(jpegConGps({ lat: 0, lon: 0 })))).toBeNull();
    expect(leerUbicacion(vista(new Uint8Array([0x89, 0x50, 0x4e, 0x47])))).toBeNull();
  });

  it('desde un archivo, y si algo falla al leerlo, no hay ubicación', async () => {
    const foto = new File([jpegConGps({ lat: -38.95, lon: -68.06 })], 'foto.jpg', { type: 'image/jpeg' });
    const rota = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00])], 'rota.jpg', {
      type: 'image/jpeg',
    });

    expect((await ubicacionDeLaFoto(foto))?.lat).toBeCloseTo(-38.95, 4);
    expect(await ubicacionDeLaFoto(rota)).toBeNull();
  });

  it('lee la ubicación de una HEIC (las fotos del iPhone), buscando dónde guarda el EXIF', async () => {
    const foto = new File([heicConGps({ lat: -38.947136, lon: -68.111708 })], 'IMG_1702.HEIC');

    const punto = await ubicacionDeLaFoto(foto);

    expect(punto?.lat).toBeCloseTo(-38.947136, 4);
    expect(punto?.lon).toBeCloseTo(-68.111708, 4);
  });
});
