import { describe, expect, it } from 'vitest';
import { aWinAnsi, generarPdf, type InformeParaPdf, nombreDelPdf } from '../src/modulos/informes/pdf.js';

const informe = (datos: Partial<InformeParaPdf> = {}): InformeParaPdf => ({
  id: 4,
  desde: '2026-10-01',
  hasta: '2026-10-31',
  area: null,
  barrio: null,
  creadoEn: new Date('2026-11-23T17:05:00Z'),
  contenido: '## Estado general\n\nAñadí señalización.',
  metricas: {},
  ...datos,
});

/** Cómo queda un texto dentro del PDF sin comprimir: en WinAnsi (Latin-1 para el castellano), en hexadecimal. */
const enElPdf = (texto: string) => Buffer.from(texto, 'latin1').toString('hex');
const sinComprimir = async (datos: Partial<InformeParaPdf> = {}) =>
  (await generarPdf(informe(datos), { comprimir: false })).toString('latin1');

describe('aWinAnsi', () => {
  it('deja el castellano como está: acentos, eñes, diéresis, signos de apertura, comillas y rayas', () => {
    const texto = 'Ñandú, pingüino: ¿qué? ¡Sí! «citas» “comillas” — raya – guion… 15 % · 3 €';
    expect(aWinAnsi(texto)).toBe(texto);
  });

  it('cambia lo que tiene un equivalente y saca el resto, sin dejar espacios sueltos', () => {
    expect(aWinAnsi('crece → hay ≥ 3 obras 🚧.')).toBe('crece -> hay >= 3 obras.');
    expect(aWinAnsi('a b')).toBe('a b');
    expect(aWinAnsi('漢字 calle')).toBe(' calle');
  });

  it('una tilde escrita como carácter aparte se junta con su letra', () => {
    expect(aWinAnsi('Neuquén')).toBe('Neuquén');
  });
});

describe('nombreDelPdf', () => {
  it('lleva el período', () => {
    expect(nombreDelPdf({ desde: '2026-10-01', hasta: '2026-10-31' })).toBe(
      'informe-2026-10-01-al-2026-10-31.pdf',
    );
  });
});

describe('generarPdf', () => {
  it('es un PDF completo', async () => {
    const pdf = await generarPdf(informe());

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('escribe los acentos y las eñes en la codificación de la fuente', async () => {
    const pdf = await sinComprimir({ barrio: 'Ñandú' });

    expect(pdf).toContain(enElPdf('Añadí señalización.'));
    expect(pdf).toContain(enElPdf(' Ñandú'));
  });

  it('el encabezado lleva el período, el área, el barrio, la fecha en hora de Argentina y el organismo', async () => {
    const pdf = await sinComprimir({
      area: { nombre: 'Bacheo' },
      barrio: 'Centro',
      metricas: { filtros: { organismo: 'Organismo' } },
    });

    // El texto puede venir partido por el interletrado: se buscan pedazos sin pares que lo partan.
    expect(pdf).toContain(enElPdf(' del 01/10/2026 al 31/10/2026'));
    expect(pdf).toContain(enElPdf(' Bacheo'));
    expect(pdf).toContain(enElPdf(' Centro'));
    expect(pdf).toContain(enElPdf('23/11/2026, 14:05'));
    expect(pdf).toContain(enElPdf('Organismo'));
  });

  it('un informe largo ocupa varias páginas', async () => {
    const parrafo = 'Los pozos de la calzada siguen siendo el problema más reportado del período. '.repeat(
      20,
    );
    const pdf = await sinComprimir({ contenido: `## Estado general\n\n${`${parrafo}\n\n`.repeat(12)}` });

    expect(pdf.match(/\/Type \/Page\b/g)!.length).toBeGreaterThanOrEqual(3);
  });
});
