import { describe, expect, it } from 'vitest';
import { contarUnos } from '../src/compartido/hashPerceptual.js';
import { hashComparable } from '../src/modulos/verificacion/servicio.js';
import {
  type AnalisisFoto,
  type Controles,
  controlesDeSenales,
  type DatosControles,
  decidirVerificacion,
  distanciaMetros,
  evaluarControles,
  type ParametrosVerificacion,
} from '../src/modulos/verificacion/calculo.js';

// Los valores de partida de la semilla (docs/calculos.md).
const p: ParametrosVerificacion = { distanciaExifMaxM: 100, hammingDuplicadoMax: 6, diasFotoAntigua: 7 };

const registradoEn = new Date('2026-10-18T12:00:00Z');
const diasAntes = (dias: number) => new Date(registradoEn.getTime() - dias * 24 * 60 * 60 * 1000);

/** Un reporte que cumple todo: foto con EXIF en el punto, del mismo día y que no se usó antes. */
const datos = (cambios: Partial<DatosControles> = {}): DatosControles => ({
  lat: -38.9516,
  lon: -68.0591,
  registradoEn,
  exif: { latitud: -38.9516, longitud: -68.0591, tomadaEn: registradoEn },
  hashComparable: true,
  fotoParecida: null,
  ...cambios,
});

const senal = (resultado: ReturnType<typeof evaluarControles>, tipo: string) =>
  resultado.senales.find((s) => s.tipo === tipo);

/** Un punto a `metros` al norte de -38.9516 (un grado de latitud son unos 111 195 m). */
const alNorte = (metros: number) => -38.9516 + metros / 111_195;

describe('evaluarControles: ubicación de la foto', () => {
  it('coincide si la foto se sacó cerca del punto', () => {
    const resultado = evaluarControles(datos(), p);

    expect(resultado.controles.ubicacion).toBe('COINCIDE');
    expect(senal(resultado, 'EXIF_COINCIDE')?.valor).toBe(1);
  });

  it('lejos del punto no se cumple, con la misma señal en negativo, y lo explica', () => {
    const lejos = datos({ exif: { latitud: alNorte(500), longitud: -68.0591, tomadaEn: registradoEn } });

    const resultado = evaluarControles(lejos, p);

    expect(resultado.controles.ubicacion).toBe('LEJOS');
    expect(senal(resultado, 'EXIF_COINCIDE')).toMatchObject({ valor: -1 });
    expect(senal(resultado, 'EXIF_COINCIDE')?.detalle).toContain('500 m');
  });

  it('justo en el límite cuenta como que coincide; un metro más, no', () => {
    // Exactamente en el límite, sin redondeos: el EXIF en el mismo punto (0 m) con un máximo de 0 m.
    const enElLimite = evaluarControles(datos(), { ...p, distanciaExifMaxM: 0 });
    const pasado = evaluarControles(
      datos({ exif: { latitud: alNorte(101), longitud: -68.0591, tomadaEn: registradoEn } }),
      p,
    );

    expect(enElLimite.controles.ubicacion).toBe('COINCIDE');
    expect(pasado.controles.ubicacion).toBe('LEJOS');
  });

  it('sin ubicación en la foto no se puede comprobar: EXIF_AUSENTE en 0', () => {
    const resultado = evaluarControles(datos({ exif: { latitud: null, longitud: null, tomadaEn: null } }), p);

    expect(resultado.controles.ubicacion).toBe('SIN_UBICACION');
    expect(senal(resultado, 'EXIF_AUSENTE')?.valor).toBe(0);
    expect(senal(resultado, 'EXIF_COINCIDE')).toBeUndefined();
  });
});

describe('evaluarControles: antigüedad de la foto', () => {
  it('hasta el máximo de días es reciente; un día más, vieja', () => {
    const justo = evaluarControles(
      datos({ exif: { latitud: -38.9516, longitud: -68.0591, tomadaEn: diasAntes(7) } }),
      p,
    );
    const vieja = evaluarControles(
      datos({ exif: { latitud: -38.9516, longitud: -68.0591, tomadaEn: diasAntes(8) } }),
      p,
    );

    expect(justo.controles.antiguedad).toBe('RECIENTE');
    expect(senal(justo, 'FECHA_ANTIGUA')?.valor).toBe(1);
    expect(vieja.controles.antiguedad).toBe('VIEJA');
    expect(senal(vieja, 'FECHA_ANTIGUA')).toMatchObject({ valor: -1 });
    expect(senal(vieja, 'FECHA_ANTIGUA')?.detalle).toContain('8 días');
  });

  it('sin fecha en la foto no se puede comprobar', () => {
    const resultado = evaluarControles(
      datos({ exif: { latitud: -38.9516, longitud: -68.0591, tomadaEn: null } }),
      p,
    );

    expect(resultado.controles.antiguedad).toBe('SIN_FECHA');
    expect(senal(resultado, 'FECHA_ANTIGUA')?.valor).toBe(0);
  });
});

describe('evaluarControles: foto repetida', () => {
  it('repetida hasta el máximo de bits distintos; con uno más es otra foto', () => {
    const repetida = evaluarControles(
      datos({ fotoParecida: { reporteId: 7, hamming: 6, mismoVecino: false } }),
      p,
    );
    const parecidaNoIgual = evaluarControles(
      datos({ fotoParecida: { reporteId: 7, hamming: 7, mismoVecino: false } }),
      p,
    );

    expect(repetida.controles.foto).toBe('REPETIDA');
    expect(senal(repetida, 'HASH_DUPLICADO')).toMatchObject({ valor: -1 });
    expect(senal(repetida, 'HASH_DUPLICADO')?.detalle).toContain('reporte 7, de otro vecino');
    expect(parecidaNoIgual.controles.foto).toBe('NUEVA');
    expect(senal(parecidaNoIgual, 'HASH_DUPLICADO')?.valor).toBe(1);
  });

  it('una foto repetida del mismo vecino tampoco se cumple', () => {
    const resultado = evaluarControles(
      datos({ fotoParecida: { reporteId: 3, hamming: 0, mismoVecino: true } }),
      p,
    );

    expect(resultado.controles.foto).toBe('REPETIDA');
    expect(senal(resultado, 'HASH_DUPLICADO')?.detalle).toContain('del mismo vecino');
  });

  it('una foto lisa u oscura no se puede comparar', () => {
    const resultado = evaluarControles(datos({ hashComparable: false }), p);

    expect(resultado.controles.foto).toBe('SIN_COMPARAR');
    expect(senal(resultado, 'HASH_DUPLICADO')?.valor).toBe(0);
  });
});

describe('evaluarControles: el nivel', () => {
  it('es el porcentaje de controles que se cumplen', () => {
    expect(evaluarControles(datos(), p).nivel).toBe(100);
    // Sin ubicación ni fecha: solo se cumple que la foto es nueva.
    expect(
      evaluarControles(datos({ exif: { latitud: null, longitud: null, tomadaEn: null } }), p).nivel,
    ).toBe(33);
    expect(
      evaluarControles(
        datos({
          exif: { latitud: alNorte(1000), longitud: -68.0591, tomadaEn: diasAntes(30) },
          fotoParecida: { reporteId: 1, hamming: 0, mismoVecino: false },
        }),
        p,
      ).nivel,
    ).toBe(0);
  });

  it('siempre da una señal por control, cada una con su explicación', () => {
    const resultado = evaluarControles(datos({ exif: { latitud: null, longitud: null, tomadaEn: null } }), p);

    expect(resultado.senales.map((s) => s.tipo)).toEqual(['EXIF_AUSENTE', 'FECHA_ANTIGUA', 'HASH_DUPLICADO']);
    expect(resultado.senales.every((s) => s.detalle.length > 0)).toBe(true);
  });
});

describe('controlesDeSenales', () => {
  it('lee cada control de su señal, como los guardó evaluarControles', () => {
    const { senales } = evaluarControles(datos(), p);
    expect(controlesDeSenales(senales)).toEqual(evaluarControles(datos(), p).controles);

    const sinNada = evaluarControles(datos({ exif: { latitud: null, longitud: null, tomadaEn: null } }), p);
    expect(controlesDeSenales(sinNada.senales)).toEqual(sinNada.controles);

    const todoMal = evaluarControles(
      datos({
        exif: { latitud: alNorte(1000), longitud: -68.0591, tomadaEn: diasAntes(30) },
        fotoParecida: { reporteId: 1, hamming: 0, mismoVecino: false },
      }),
      p,
    );
    expect(controlesDeSenales(todoMal.senales)).toEqual(todoMal.controles);
  });

  it('un reporte sin señales cuenta como que no tiene con qué hacer los controles', () => {
    expect(controlesDeSenales([])).toEqual({
      ubicacion: 'SIN_UBICACION',
      antiguedad: 'SIN_FECHA',
      foto: 'SIN_COMPARAR',
    });
  });
});

describe('decidirVerificacion', () => {
  const eligio = { categoriaId: 1, severidad: 'GRAVE' };
  const ve = (cambios: Partial<AnalisisFoto> = {}): AnalisisFoto => ({
    esProblemaViaPublica: true,
    categoriaId: 1,
    severidad: 'GRAVE',
    mismoProblema: null,
    datosPersonales: false,
    ...cambios,
  });
  const controles = (cambios: Partial<Controles> = {}): Controles => ({
    ubicacion: 'COINCIDE',
    antiguedad: 'RECIENTE',
    foto: 'NUEVA',
    ...cambios,
  });

  it('publica si la foto muestra lo que eligió el vecino y se sacó en el punto', () => {
    expect(decidirVerificacion({ analisis: ve(), eligio, controles: controles() })).toMatchObject({
      resultado: 'PUBLICAR',
      prueba: 'UBICACION',
    });
    // Sin fecha ni hash para comparar no hay nada en contra.
    const sinDatos = controles({ antiguedad: 'SIN_FECHA', foto: 'SIN_COMPARAR' });
    expect(decidirVerificacion({ analisis: ve(), eligio, controles: sinDatos }).resultado).toBe('PUBLICAR');
  });

  it('sin ubicación, publica si es el mismo problema que un reporte ya verificado del incidente', () => {
    const sinUbicacion = controles({ ubicacion: 'SIN_UBICACION' });

    expect(
      decidirVerificacion({ analisis: ve({ mismoProblema: true }), eligio, controles: sinUbicacion }),
    ).toMatchObject({ resultado: 'PUBLICAR', prueba: 'CORROBORADO' });
    expect(
      decidirVerificacion({ analisis: ve({ mismoProblema: false }), eligio, controles: sinUbicacion }),
    ).toMatchObject({ resultado: 'REVISAR', motivo: expect.stringContaining('no parece el mismo problema') });
    expect(decidirVerificacion({ analisis: ve(), eligio, controles: sinUbicacion })).toMatchObject({
      resultado: 'REVISAR',
      motivo: expect.stringContaining('no hay un reporte verificado'),
    });
  });

  it('si la foto no muestra un problema de la vía pública, la deja para desestimar, pase lo que pase con lo demás', () => {
    const decision = decidirVerificacion({
      analisis: ve({ esProblemaViaPublica: false, categoriaId: null, severidad: null }),
      eligio,
      controles: controles(),
    });

    expect(decision.resultado).toBe('DESESTIMAR');
    expect(decision.motivo).toContain('desestimados pendientes');
  });

  it('otra categoría u otra gravedad: revisión manual', () => {
    expect(
      decidirVerificacion({ analisis: ve({ categoriaId: 2 }), eligio, controles: controles() }),
    ).toMatchObject({ resultado: 'REVISAR', motivo: expect.stringContaining('otra categoría o gravedad') });
    expect(
      decidirVerificacion({ analisis: ve({ severidad: 'LEVE' }), eligio, controles: controles() }).resultado,
    ).toBe('REVISAR');
  });

  it('con datos personales, una foto repetida, vieja o sacada lejos: revisión manual, aunque el resto esté bien', () => {
    const casos: [Partial<AnalisisFoto>, Partial<Controles>, string][] = [
      [{ datosPersonales: true }, {}, 'cara o una patente'],
      [{}, { foto: 'REPETIDA' }, 'ya se usó'],
      [{}, { antiguedad: 'VIEJA' }, 'es vieja'],
      [{ mismoProblema: true }, { ubicacion: 'LEJOS' }, 'lejos del punto'],
    ];
    for (const [analisis, enContra, motivo] of casos) {
      expect(
        decidirVerificacion({ analisis: ve(analisis), eligio, controles: controles(enContra) }),
      ).toMatchObject({ resultado: 'REVISAR', motivo: expect.stringContaining(motivo) });
    }
  });
});

describe('hashComparable', () => {
  const conUnos = (unos: number) => '1'.repeat(unos) + '0'.repeat(64 - unos);

  it('un hash con hamming_duplicado_max unos o menos no sirve para decir que dos fotos son la misma', () => {
    // 64 ceros es el hash de cualquier foto lisa; con 6 unos queda a 6 bits de esa foto.
    expect(contarUnos(conUnos(0))).toBe(0);
    expect(hashComparable(conUnos(0), 6)).toBe(false);
    expect(hashComparable(conUnos(6), 6)).toBe(false);
    expect(hashComparable(conUnos(7), 6)).toBe(true);
    expect(hashComparable(null, 6)).toBe(false);
  });
});

describe('distanciaMetros', () => {
  it('mide en metros: un grado de latitud son unos 111 km', () => {
    expect(distanciaMetros(-38, -68, -39, -68)).toBeCloseTo(111_195, -2);
    expect(distanciaMetros(-38.9516, -68.0591, -38.9516, -68.0591)).toBe(0);
  });
});
