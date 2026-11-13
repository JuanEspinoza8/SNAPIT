import { describe, expect, it } from 'vitest';
import {
  describir,
  hoyEnArgentina,
  type Listas,
  normalizar,
  type Propuesta,
  validarPropuesta,
} from '../src/modulos/consultas/calculo.js';
import { esquemaFiltros } from '../src/modulos/incidentes/esquemas.js';

const listas: Listas = {
  categorias: [
    { id: 1, nombre: 'Pozo en la calzada' },
    { id: 2, nombre: 'Cordón sin rampa' },
  ],
  barrios: ['Área Centro Este', 'Villa Ceferino'],
};

/** Una propuesta sin filtros, salvo lo que se pise. */
const propuesta = (datos: Partial<Propuesta> = {}): Propuesta => ({
  categoria: null,
  estado: null,
  barrio: null,
  desde: null,
  hasta: null,
  ...datos,
});

describe('normalizar', () => {
  it('ignora mayúsculas, tildes y espacios de más', () => {
    expect(normalizar('  ÁREA   Centro  este ')).toBe('area centro este');
    expect(normalizar('Cordón sin rampa')).toBe(normalizar('cordon SIN rampa'));
  });
});

describe('validarPropuesta', () => {
  it('con todo de las listas arma los filtros sin avisos', () => {
    const resultado = validarPropuesta(
      propuesta({
        categoria: 'Pozo en la calzada',
        estado: 'EN_EJECUCION',
        barrio: 'Área Centro Este',
        desde: '2026-11-01',
        hasta: '2026-11-13',
      }),
      listas,
    );

    expect(resultado).toEqual({
      filtros: {
        categoriaId: 1,
        estado: 'EN_EJECUCION',
        desde: '2026-11-01',
        hasta: '2026-11-13',
        barrio: 'Área Centro Este',
      },
      categoriaNombre: 'Pozo en la calzada',
      avisos: [],
    });
  });

  it('encuentra la categoría y el barrio aunque cambien mayúsculas o tildes, y devuelve el nombre de la lista', () => {
    const { filtros, categoriaNombre, avisos } = validarPropuesta(
      propuesta({ categoria: 'cordon sin RAMPA', barrio: 'area centro este' }),
      listas,
    );

    expect(filtros.categoriaId).toBe(2);
    expect(categoriaNombre).toBe('Cordón sin rampa');
    expect(filtros.barrio).toBe('Área Centro Este');
    expect(avisos).toEqual([]);
  });

  it('sin nada propuesto no filtra por nada', () => {
    expect(validarPropuesta(propuesta(), listas)).toEqual({
      filtros: { categoriaId: null, estado: null, desde: null, hasta: null, barrio: null },
      categoriaNombre: null,
      avisos: [],
    });
  });

  it('descarta una categoría que no está en la lista y lo avisa con lo que se pidió', () => {
    const { filtros, categoriaNombre, avisos } = validarPropuesta(
      propuesta({ categoria: 'semáforos', barrio: 'Villa Ceferino' }),
      listas,
    );

    expect(filtros.categoriaId).toBeNull();
    expect(categoriaNombre).toBeNull();
    expect(filtros.barrio).toBe('Villa Ceferino');
    expect(avisos).toEqual(['No hay una categoría «semáforos»: no se filtra por categoría.']);
  });

  it('descarta un barrio que no está en la lista y lo avisa con lo que se pidió', () => {
    const { filtros, avisos } = validarPropuesta(
      propuesta({ barrio: 'Palermo', categoria: 'Pozo en la calzada' }),
      listas,
    );

    expect(filtros.barrio).toBeNull();
    expect(filtros.categoriaId).toBe(1);
    expect(avisos).toEqual(['No hay un barrio «Palermo» con problemas en el mapa: no se filtra por barrio.']);
  });

  it('un nombre que solo se parece no alcanza', () => {
    const { filtros, avisos } = validarPropuesta(propuesta({ categoria: 'Pozo', barrio: 'Centro' }), listas);

    expect(filtros.categoriaId).toBeNull();
    expect(filtros.barrio).toBeNull();
    expect(avisos).toHaveLength(2);
  });

  it('con listas vacías descarta todo lo que se pidió', () => {
    const { filtros, avisos } = validarPropuesta(
      propuesta({ categoria: 'Pozo en la calzada', barrio: 'Villa Ceferino' }),
      { categorias: [], barrios: [] },
    );

    expect(filtros.categoriaId).toBeNull();
    expect(filtros.barrio).toBeNull();
    expect(avisos).toHaveLength(2);
  });

  it('un texto vacío cuenta como no pedido: no avisa', () => {
    const { filtros, avisos } = validarPropuesta(
      propuesta({ categoria: '  ', barrio: '', estado: '' }),
      listas,
    );

    expect(filtros).toMatchObject({ categoriaId: null, barrio: null, estado: null });
    expect(avisos).toEqual([]);
  });

  it('acepta los estados del mapa y descarta los demás', () => {
    expect(validarPropuesta(propuesta({ estado: 'resuelto' }), listas).filtros.estado).toBe('RESUELTO');

    const { filtros, avisos } = validarPropuesta(propuesta({ estado: 'DESESTIMADO' }), listas);
    expect(filtros.estado).toBeNull();
    expect(avisos).toEqual(['El estado «DESESTIMADO» no se muestra en el mapa: no se filtra por estado.']);
  });

  it('un período que termina antes de empezar se descarta entero', () => {
    const { filtros, avisos } = validarPropuesta(
      propuesta({ desde: '2026-11-13', hasta: '2026-11-01', categoria: 'Pozo en la calzada' }),
      listas,
    );

    expect(filtros).toMatchObject({ desde: null, hasta: null, categoriaId: 1 });
    expect(avisos).toEqual(['El período termina antes de empezar: no se filtra por fecha.']);
  });

  it('acepta un período de un solo día y uno abierto de un lado', () => {
    expect(
      validarPropuesta(propuesta({ desde: '2026-11-13', hasta: '2026-11-13' }), listas).filtros,
    ).toMatchObject({
      desde: '2026-11-13',
      hasta: '2026-11-13',
    });
    expect(validarPropuesta(propuesta({ desde: '2026-11-01' }), listas).filtros).toMatchObject({
      desde: '2026-11-01',
      hasta: null,
    });
    expect(validarPropuesta(propuesta({ hasta: '2026-10-31' }), listas).filtros).toMatchObject({
      desde: null,
      hasta: '2026-10-31',
    });
  });

  it.each([
    propuesta({
      categoria: 'Pozo en la calzada',
      estado: 'RESUELTO',
      barrio: 'Villa Ceferino',
      desde: '2026-10-01',
      hasta: '2026-10-31',
    }),
    propuesta({
      categoria: 'inventada',
      estado: 'OTRO',
      barrio: 'inventado',
      desde: '2026-12-01',
      hasta: '2026-01-01',
    }),
    propuesta({ desde: '2026-02-28' }),
    propuesta(),
  ])('los filtros que devuelve siempre los acepta GET /api/incidentes (%#)', (entrada) => {
    const { filtros } = validarPropuesta(entrada, listas);
    // El cliente manda solo los que no son null.
    const consulta = Object.fromEntries(Object.entries(filtros).filter(([, valor]) => valor !== null));

    expect(esquemaFiltros.safeParse(consulta).success).toBe(true);
  });
});

describe('describir', () => {
  it('nombra cada filtro con palabras', () => {
    const texto = describir(
      validarPropuesta(
        propuesta({
          categoria: 'Pozo en la calzada',
          estado: 'EN_EJECUCION',
          barrio: 'Área Centro Este',
          desde: '2026-11-01',
          hasta: '2026-11-13',
        }),
        listas,
      ),
    );

    expect(texto).toBe(
      'Entendí: categoría Pozo en la calzada, estado en ejecución, barrio Área Centro Este, reportados del 01/11/2026 al 13/11/2026.',
    );
  });

  it('sin filtros dice que se buscan todos', () => {
    expect(describir(validarPropuesta(propuesta(), listas))).toBe('Entendí: todos los problemas del mapa.');
  });

  it('describe un período de un día y uno abierto de un lado', () => {
    expect(describir(validarPropuesta(propuesta({ desde: '2026-11-13', hasta: '2026-11-13' }), listas))).toBe(
      'Entendí: reportados el 13/11/2026.',
    );
    expect(describir(validarPropuesta(propuesta({ desde: '2026-11-01' }), listas))).toBe(
      'Entendí: reportados desde el 01/11/2026.',
    );
    expect(describir(validarPropuesta(propuesta({ hasta: '2026-10-31' }), listas))).toBe(
      'Entendí: reportados hasta el 31/10/2026.',
    );
  });

  it('suma los avisos y no nombra lo descartado como filtro', () => {
    const texto = describir(
      validarPropuesta(propuesta({ categoria: 'semáforos', barrio: 'Villa Ceferino' }), listas),
    );

    expect(texto).toBe(
      'Entendí: barrio Villa Ceferino. No hay una categoría «semáforos»: no se filtra por categoría.',
    );
  });

  it('si se descartó todo, busca todos y lo avisa', () => {
    const texto = describir(
      validarPropuesta(propuesta({ categoria: 'semáforos', barrio: 'Palermo' }), listas),
    );

    expect(texto).toBe(
      'Entendí: todos los problemas del mapa. No hay una categoría «semáforos»: no se filtra por categoría. ' +
        'No hay un barrio «Palermo» con problemas en el mapa: no se filtra por barrio.',
    );
  });
});

describe('hoyEnArgentina', () => {
  it('devuelve la fecha y el día de la semana en hora de Argentina', () => {
    expect(hoyEnArgentina(new Date('2026-11-13T15:00:00Z'))).toEqual({ fecha: '2026-11-13', dia: 'viernes' });
  });

  it('a la 01:00 UTC en Argentina todavía es el día anterior', () => {
    expect(hoyEnArgentina(new Date('2026-11-14T01:00:00Z'))).toEqual({ fecha: '2026-11-13', dia: 'viernes' });
    // Justo a la medianoche de acá ya es el día siguiente.
    expect(hoyEnArgentina(new Date('2026-11-14T03:00:00Z')).fecha).toBe('2026-11-14');
  });
});
