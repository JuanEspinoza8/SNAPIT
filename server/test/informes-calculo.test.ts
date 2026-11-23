import { describe, expect, it } from 'vitest';
import type { InformeIa } from '../src/modulos/ia/redactarInforme.js';
import { armarContenido, type Prioritario } from '../src/modulos/informes/calculo.js';

const prioritario = (id: number, datos: Partial<Prioritario> = {}): Prioritario => ({
  id,
  categoria: 'Pozo en la calzada',
  area: 'Bacheo',
  estado: 'VERIFICADO',
  prioridad: 80,
  direccion: 'Lanín 100, Centro',
  barrio: 'Centro',
  diasAbierto: 12.5,
  reportes: 3,
  ...datos,
});

const informe = (orden: InformeIa['ordenDeIntervencion'] = []): InformeIa => ({
  estadoGeneral: 'Hay 5 abiertos.',
  zonasCriticas: 'El Centro concentra la mayoría.',
  categoriasFrecuentes: 'Predominan los pozos.',
  demoras: 'Las veredas tardan más.',
  ordenDeIntervencion: orden,
});

describe('armarContenido', () => {
  it('arma las cinco secciones en orden, cada una con su título', () => {
    const { contenido } = armarContenido(informe(), []);

    expect(contenido).toBe(
      [
        '## Estado general\n\nHay 5 abiertos.',
        '## Zonas críticas\n\nEl Centro concentra la mayoría.',
        '## Categorías frecuentes\n\nPredominan los pozos.',
        '## Demoras\n\nLas veredas tardan más.',
        '## Orden de intervención\n\nNo hay incidentes abiertos para ordenar.',
      ].join('\n\n'),
    );
  });

  it('el orden de intervención describe cada incidente con sus datos, en el orden de la IA', () => {
    const { contenido, descartados } = armarContenido(
      informe([
        { incidenteId: 8, justificacion: 'Lleva más días.' },
        { incidenteId: 7, justificacion: 'Tiene más reportes.' },
      ]),
      [
        prioritario(7),
        prioritario(8, {
          categoria: 'Luminaria apagada',
          direccion: null,
          prioridad: 45.25,
          diasAbierto: 30,
        }),
      ],
    );

    expect(descartados).toBe(0);
    expect(contenido).toContain(
      '## Orden de intervención\n\n' +
        '1. Incidente #8: Luminaria apagada, sin dirección todavía (prioridad 45,3, 30 días abierto). Lleva más días.\n' +
        '2. Incidente #7: Pozo en la calzada, Lanín 100, Centro (prioridad 80, 12,5 días abierto). Tiene más reportes.',
    );
  });

  it('descarta los ids que no están en los datos y los repetidos', () => {
    const { contenido, descartados } = armarContenido(
      informe([
        { incidenteId: 999, justificacion: 'Inventado.' },
        { incidenteId: 7, justificacion: 'Primero.' },
        { incidenteId: 7, justificacion: 'Repetido.' },
      ]),
      [prioritario(7)],
    );

    expect(descartados).toBe(2);
    expect(contenido).not.toContain('#999');
    expect(contenido).not.toContain('Repetido.');
    expect(contenido).toContain('1. Incidente #7: ');
  });

  it('si la IA no propone un orden válido y hay abiertos, van por prioridad', () => {
    const { contenido } = armarContenido(informe([{ incidenteId: 999, justificacion: 'Inventado.' }]), [
      prioritario(7),
      prioritario(8),
    ]);

    expect(contenido).toContain(
      'Sin una propuesta de la IA, van de mayor a menor prioridad:\n1. Incidente #7: ',
    );
    expect(contenido).toContain('\n2. Incidente #8: ');
  });
});
