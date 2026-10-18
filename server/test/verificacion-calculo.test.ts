import { describe, expect, it } from 'vitest';
import {
  calcularConfianza,
  type DatosConfianza,
  distanciaMetros,
  type ParametrosVerificacion,
} from '../src/modulos/verificacion/calculo.js';

// Los valores de partida de la semilla (docs/calculos.md).
const p: ParametrosVerificacion = {
  confianzaBase: 50,
  umbralVerificado: 60,
  distanciaExifMaxM: 100,
  valorExifCoincide: 20,
  valorExifNoCoincide: -30,
  valorExifAusente: -10,
  hammingDuplicadoMax: 6,
  valorHashDuplicado: -40,
  valorOrigenApp: 15,
  valorReputacionMax: 20,
  diasFotoAntigua: 7,
  valorFechaAntigua: -20,
};

const registradoEn = new Date('2026-10-18T12:00:00Z');
const diasAntes = (dias: number) => new Date(registradoEn.getTime() - dias * 24 * 60 * 60 * 1000);

/** Un reporte neutro: foto de galería con EXIF en el punto, reputación inicial y sin repetir. */
const datos = (cambios: Partial<DatosConfianza> = {}): DatosConfianza => ({
  lat: -38.9516,
  lon: -68.0591,
  registradoEn,
  tomadaConCamaraApp: false,
  exif: { latitud: -38.9516, longitud: -68.0591, tomadaEn: registradoEn },
  reputacion: 50,
  fotoParecida: null,
  ...cambios,
});

const senal = (resultado: ReturnType<typeof calcularConfianza>, tipo: string) =>
  resultado.senales.find((s) => s.tipo === tipo);

/** Un punto a `metros` al norte de -38.9516 (un grado de latitud son unos 111 195 m). */
const alNorte = (metros: number) => -38.9516 + metros / 111_195;

describe('calcularConfianza: cada señal', () => {
  it('EXIF_COINCIDE suma si la foto se sacó cerca del punto', () => {
    const resultado = calcularConfianza(datos(), p);

    expect(senal(resultado, 'EXIF_COINCIDE')?.valor).toBe(20);
    expect(resultado.nivel).toBe(70);
  });

  it('EXIF lejos del punto resta con la misma señal y lo explica', () => {
    const lejos = datos({ exif: { latitud: alNorte(500), longitud: -68.0591, tomadaEn: registradoEn } });

    const resultado = calcularConfianza(lejos, p);

    expect(senal(resultado, 'EXIF_COINCIDE')).toMatchObject({ valor: -30 });
    expect(senal(resultado, 'EXIF_COINCIDE')?.detalle).toContain('500 m');
  });

  it('distancia justo en el límite cuenta como que coincide; un metro más, no', () => {
    const enElLimite = calcularConfianza(
      datos({ exif: { latitud: alNorte(99.999), longitud: -68.0591, tomadaEn: registradoEn } }),
      p,
    );
    const pasado = calcularConfianza(
      datos({ exif: { latitud: alNorte(101), longitud: -68.0591, tomadaEn: registradoEn } }),
      p,
    );

    expect(senal(enElLimite, 'EXIF_COINCIDE')?.valor).toBe(20);
    expect(senal(pasado, 'EXIF_COINCIDE')?.valor).toBe(-30);
  });

  it('sin EXIF, una foto de galería resta EXIF_AUSENTE', () => {
    const resultado = calcularConfianza(
      datos({ exif: { latitud: null, longitud: null, tomadaEn: null } }),
      p,
    );

    expect(senal(resultado, 'EXIF_AUSENTE')?.valor).toBe(-10);
    expect(senal(resultado, 'EXIF_COINCIDE')).toBeUndefined();
    expect(resultado.nivel).toBe(40);
  });

  it('sin EXIF, una foto de la cámara de la app no resta: la app puede no grabar la ubicación', () => {
    const resultado = calcularConfianza(
      datos({ tomadaConCamaraApp: true, exif: { latitud: null, longitud: null, tomadaEn: null } }),
      p,
    );

    expect(senal(resultado, 'EXIF_AUSENTE')).toBeUndefined();
    expect(senal(resultado, 'ORIGEN_APP')?.valor).toBe(15);
  });

  it('HASH_DUPLICADO resta si la misma foto ya se usó, hasta el máximo de bits distintos', () => {
    const repetida = calcularConfianza(
      datos({ fotoParecida: { reporteId: 7, hamming: 6, mismoVecino: false } }),
      p,
    );
    const parecidaNoIgual = calcularConfianza(
      datos({ fotoParecida: { reporteId: 7, hamming: 7, mismoVecino: false } }),
      p,
    );

    expect(senal(repetida, 'HASH_DUPLICADO')).toMatchObject({ valor: -40 });
    expect(senal(repetida, 'HASH_DUPLICADO')?.detalle).toContain('reporte 7, de otro vecino');
    expect(senal(parecidaNoIgual, 'HASH_DUPLICADO')).toBeUndefined();
  });

  it('una foto repetida del mismo vecino también resta', () => {
    const resultado = calcularConfianza(
      datos({ fotoParecida: { reporteId: 3, hamming: 0, mismoVecino: true } }),
      p,
    );

    expect(senal(resultado, 'HASH_DUPLICADO')).toMatchObject({ valor: -40 });
    expect(senal(resultado, 'HASH_DUPLICADO')?.detalle).toContain('del mismo vecino');
  });

  it('ORIGEN_APP suma si la foto se sacó con la cámara de la app', () => {
    expect(senal(calcularConfianza(datos({ tomadaConCamaraApp: true }), p), 'ORIGEN_APP')?.valor).toBe(15);
    expect(senal(calcularConfianza(datos(), p), 'ORIGEN_APP')).toBeUndefined();
  });

  it('REPUTACION: 0 resta el máximo, 50 no mueve nada y 100 suma el máximo', () => {
    expect(senal(calcularConfianza(datos({ reputacion: 0 }), p), 'REPUTACION')?.valor).toBe(-20);
    expect(senal(calcularConfianza(datos({ reputacion: 50 }), p), 'REPUTACION')?.valor).toBe(0);
    expect(senal(calcularConfianza(datos({ reputacion: 100 }), p), 'REPUTACION')?.valor).toBe(20);
    expect(senal(calcularConfianza(datos({ reputacion: 75 }), p), 'REPUTACION')?.valor).toBe(10);
  });

  it('FECHA_ANTIGUA resta si la foto es de más días antes que el máximo', () => {
    const antigua = calcularConfianza(
      datos({ exif: { latitud: -38.9516, longitud: -68.0591, tomadaEn: diasAntes(8) } }),
      p,
    );
    const justo = calcularConfianza(
      datos({ exif: { latitud: -38.9516, longitud: -68.0591, tomadaEn: diasAntes(7) } }),
      p,
    );

    expect(senal(antigua, 'FECHA_ANTIGUA')).toMatchObject({ valor: -20 });
    expect(senal(antigua, 'FECHA_ANTIGUA')?.detalle).toContain('8 días');
    expect(senal(justo, 'FECHA_ANTIGUA')).toBeUndefined();
  });
});

describe('calcularConfianza: el nivel y el estado', () => {
  it('un nivel que daría negativo queda en 0', () => {
    // 50 − 30 (EXIF lejos) − 40 (repetida) − 20 (reputación 0) − 20 (antigua) = −60
    const resultado = calcularConfianza(
      datos({
        exif: { latitud: alNorte(1000), longitud: -68.0591, tomadaEn: diasAntes(30) },
        fotoParecida: { reporteId: 1, hamming: 0, mismoVecino: false },
        reputacion: 0,
      }),
      p,
    );

    expect(resultado.nivel).toBe(0);
    expect(resultado.estado).toBe('PENDIENTE_REVISION');
  });

  it('un nivel que daría más de 100 queda en 100', () => {
    // 50 + 20 (EXIF) + 15 (app) + 20 (reputación 100) = 105
    const resultado = calcularConfianza(datos({ tomadaConCamaraApp: true, reputacion: 100 }), p);

    expect(resultado.nivel).toBe(100);
    expect(resultado.estado).toBe('VERIFICADO');
  });

  it('queda VERIFICADO desde el umbral, y PENDIENTE_REVISION por debajo', () => {
    // 50 + 20 (EXIF) − 10 (reputación 25) = 60
    expect(calcularConfianza(datos({ reputacion: 25 }), p)).toMatchObject({
      nivel: 60,
      estado: 'VERIFICADO',
    });
    // 50 + 20 − 12 (reputación 20) = 58
    expect(calcularConfianza(datos({ reputacion: 20 }), p)).toMatchObject({
      nivel: 58,
      estado: 'PENDIENTE_REVISION',
    });
  });

  it('nunca desestima por sí solo, ni con el peor nivel posible', () => {
    const peor = calcularConfianza(
      datos({
        exif: { latitud: alNorte(1000), longitud: -68.0591, tomadaEn: diasAntes(30) },
        fotoParecida: { reporteId: 1, hamming: 0, mismoVecino: true },
        reputacion: 0,
      }),
      p,
    );

    expect(peor.estado).not.toBe('DESESTIMADO');
  });

  it('cada señal trae una explicación', () => {
    const resultado = calcularConfianza(datos({ tomadaConCamaraApp: true }), p);

    expect(resultado.senales.every((s) => s.detalle.length > 0)).toBe(true);
  });
});

describe('distanciaMetros', () => {
  it('mide en metros: un grado de latitud son unos 111 km', () => {
    expect(distanciaMetros(-38, -68, -39, -68)).toBeCloseTo(111_195, -2);
    expect(distanciaMetros(-38.9516, -68.0591, -38.9516, -68.0591)).toBe(0);
  });
});
