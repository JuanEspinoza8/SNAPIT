import PDFDocument from 'pdfkit';
import { ZONA_HORARIA } from '../../compartido/zonaHoraria.js';

/** Lo que el PDF necesita de un informe (la forma de GET /api/informes/:id). */
export interface InformeParaPdf {
  id: number;
  desde: string;
  hasta: string;
  area: { nombre: string } | null;
  barrio: string | null;
  creadoEn: Date;
  contenido: string;
  metricas: unknown;
}

/** Las partes de informe.metricas que van en la tabla. Se leen con cuidado: es un JSON guardado. */
interface Metricas {
  filtros?: { organismo?: string };
  abiertosPorEstado?: { estado: string; cantidad: number }[];
  nuevosYResueltosPorSemana?: { nuevos: number; resueltos: number }[];
  reportesDesestimados?: { total: number; desestimados: number; porcentaje: number | null };
  categoriasFrecuentes?: { nombre: string; nuevos: number; abiertos: number }[];
  masPrioritarios?: {
    id: number;
    categoria: string;
    direccion: string | null;
    prioridad: number;
    diasAbierto: number;
    reportes: number;
  }[];
}

/*
 * Las fuentes estándar del PDF (Helvetica) usan la codificación WinAnsi: tiene todo el castellano (á, ñ, ü, ¿, «,
 * comillas tipográficas, rayas), pero no cualquier carácter. Lo que la IA escriba fuera de esa tabla se cambia
 * por un equivalente o se saca, para que no salga como un símbolo roto en el visor.
 */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const EQUIVALENTES: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '≥': '>=',
  '≤': '<=',
  '≠': '!=',
  '≈': '~',
  '−': '-',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '′': "'",
  '″': '"',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
};

export function aWinAnsi(texto: string) {
  let resultado = '';
  for (const caracter of texto.normalize('NFC')) {
    const codigo = caracter.codePointAt(0)!;
    if (caracter === '\n' || (codigo >= 0x20 && codigo <= 0x7e) || (codigo >= 0xa0 && codigo <= 0xff)) {
      resultado += caracter;
    } else if (WIN_ANSI_EXTRA.includes(caracter)) {
      resultado += caracter;
    } else if (caracter in EQUIVALENTES) {
      resultado += EQUIVALENTES[caracter];
    }
    // El resto (emojis, otros alfabetos, controles) se saca.
  }
  // Sin lo que se sacó no quedan espacios dobles ni un espacio suelto antes de un signo.
  return resultado.replace(/ {2,}/g, ' ').replace(/ ([.,;:!?)])/g, '$1');
}

const dia = (aaaammdd: string) => aaaammdd.split('-').reverse().join('/');
const numero = (valor: number) => valor.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const fechaYHora = (fecha: Date) =>
  new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: ZONA_HORARIA,
  }).format(fecha);

/** El nombre del archivo, con el período: informe-2026-10-01-al-2026-10-31.pdf. */
export const nombreDelPdf = (informe: Pick<InformeParaPdf, 'desde' | 'hasta'>) =>
  `informe-${informe.desde}-al-${informe.hasta}.pdf`;

const MARGEN = 50;
const GRIS = '#555555';

type Documento = InstanceType<typeof PDFDocument>;
type Columna = { titulo: string; ancho: number; alinear?: 'left' | 'right' };

/** Una tabla simple: encabezado en negrita y una fila por elemento, que salta de página si no entra. */
function tabla(doc: Documento, columnas: Columna[], filas: string[][]) {
  const fila = (celdas: string[], fuente: string) => {
    doc.font(fuente).fontSize(9);
    const alto = Math.max(
      ...celdas.map((celda, i) => doc.heightOfString(aWinAnsi(celda), { width: columnas[i]!.ancho - 6 })),
    );
    if (doc.y + alto > doc.page.height - MARGEN) doc.addPage();
    const y = doc.y;
    let x = MARGEN;
    celdas.forEach((celda, i) => {
      const { ancho, alinear = 'left' } = columnas[i]!;
      doc.text(aWinAnsi(celda), x + 3, y, { width: ancho - 6, align: alinear });
      x += ancho;
    });
    doc.x = MARGEN;
    doc.y = y + alto + 4;
    doc
      .moveTo(MARGEN, doc.y - 2)
      .lineTo(MARGEN + columnas.reduce((total, c) => total + c.ancho, 0), doc.y - 2)
      .strokeColor('#cccccc')
      .lineWidth(0.5)
      .stroke();
  };
  fila(
    columnas.map((c) => c.titulo),
    'Helvetica-Bold',
  );
  for (const celdas of filas) fila(celdas, 'Helvetica');
  doc.moveDown(0.8);
}

function subtitulo(doc: Documento, texto: string) {
  if (doc.y > doc.page.height - MARGEN - 60) doc.addPage();
  doc.x = MARGEN;
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(13).fillColor('black').text(aWinAnsi(texto));
  doc.moveDown(0.3);
}

function encabezado(doc: Documento, informe: InformeParaPdf, metricas: Metricas) {
  doc.font('Helvetica-Bold').fontSize(18).text('Informe de estado y prioridades');
  doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor(GRIS);
  const renglones = [
    metricas.filtros?.organismo && `Organismo: ${metricas.filtros.organismo}`,
    `Área: ${informe.area?.nombre ?? 'todas'}`,
    `Período: del ${dia(informe.desde)} al ${dia(informe.hasta)}`,
    `Barrio: ${informe.barrio ?? 'todos'}`,
    `Generado el ${fechaYHora(informe.creadoEn)} · Informe #${informe.id}`,
  ];
  for (const renglon of renglones) if (renglon) doc.text(aWinAnsi(renglon));
  doc.fillColor('black').moveDown(0.5);
  doc
    .moveTo(MARGEN, doc.y)
    .lineTo(doc.page.width - MARGEN, doc.y)
    .strokeColor('#999999')
    .lineWidth(1)
    .stroke();
}

/** El contenido: cada `## Título` es un subtítulo y el resto, párrafos. */
function contenido(doc: Documento, texto: string) {
  for (const bloque of texto.split(/\n{2,}/)) {
    const titulo = bloque.match(/^## (.+)$/);
    if (titulo) {
      subtitulo(doc, titulo[1]!);
      continue;
    }
    doc.font('Helvetica').fontSize(10.5).fillColor('black');
    for (const parrafo of bloque.split('\n')) {
      doc.text(aWinAnsi(parrafo), MARGEN, doc.y, { align: 'left', lineGap: 2 });
      doc.moveDown(0.3);
    }
  }
}

function tablasDeMetricas(doc: Documento, metricas: Metricas) {
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(15).text('Métricas del período');
  doc.font('Helvetica').fontSize(9).fillColor(GRIS);
  doc.text('Los números que se le pasaron a la IA para escribir el informe.');
  doc.fillColor('black');

  const semanas = metricas.nuevosYResueltosPorSemana ?? [];
  const reportes = metricas.reportesDesestimados;
  const resumen: string[][] = [
    ...(metricas.abiertosPorEstado ?? []).map(({ estado, cantidad }) => [
      ESTADOS[estado] ?? estado,
      String(cantidad),
    ]),
    ['Incidentes nuevos', String(semanas.reduce((total, s) => total + s.nuevos, 0))],
    ['Incidentes resueltos', String(semanas.reduce((total, s) => total + s.resueltos, 0))],
  ];
  if (reportes) {
    resumen.push(['Reportes recibidos', String(reportes.total)]);
    resumen.push([
      'Reportes desestimados',
      `${reportes.desestimados}${reportes.porcentaje === null ? '' : ` (${numero(reportes.porcentaje)} %)`}`,
    ]);
  }
  subtitulo(doc, 'Resumen');
  tabla(
    doc,
    [
      { titulo: 'Indicador', ancho: 300 },
      { titulo: 'Valor', ancho: 100, alinear: 'right' },
    ],
    resumen,
  );

  const categorias = metricas.categoriasFrecuentes ?? [];
  if (categorias.length > 0) {
    subtitulo(doc, 'Categorías más frecuentes');
    tabla(
      doc,
      [
        { titulo: 'Categoría', ancho: 300 },
        { titulo: 'Nuevos', ancho: 80, alinear: 'right' },
        { titulo: 'Siguen abiertos', ancho: 100, alinear: 'right' },
      ],
      categorias.map((c) => [c.nombre, String(c.nuevos), String(c.abiertos)]),
    );
  }

  const prioritarios = metricas.masPrioritarios ?? [];
  if (prioritarios.length > 0) {
    subtitulo(doc, 'Incidentes abiertos más prioritarios');
    tabla(
      doc,
      [
        { titulo: '#', ancho: 45 },
        { titulo: 'Categoría', ancho: 120 },
        { titulo: 'Dirección', ancho: 170 },
        { titulo: 'Prioridad', ancho: 60, alinear: 'right' },
        { titulo: 'Días', ancho: 45, alinear: 'right' },
        { titulo: 'Reportes', ancho: 55, alinear: 'right' },
      ],
      prioritarios.map((p) => [
        String(p.id),
        p.categoria,
        p.direccion ?? 'Sin dirección',
        numero(p.prioridad),
        numero(p.diasAbierto),
        String(p.reportes),
      ]),
    );
  }
}

// Los abiertos por estado, como se leen en la tabla.
const ESTADOS: Record<string, string> = {
  REGISTRADO: 'Abiertos en revisión',
  VERIFICADO: 'Verificados, sin derivar',
  DERIVADO: 'Derivados al área',
  EN_EJECUCION: 'En ejecución',
};

/** El PDF del informe (F14): encabezado, el contenido por secciones y, en otra página, la tabla de métricas. */
export function generarPdf(informe: InformeParaPdf, opciones: { comprimir?: boolean } = {}) {
  const metricas = (informe.metricas ?? {}) as Metricas;
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGEN,
    compress: opciones.comprimir ?? true,
    info: {
      Title: aWinAnsi(`Informe de estado y prioridades ${dia(informe.desde)} - ${dia(informe.hasta)}`),
      Author: 'SnapIt',
      CreationDate: informe.creadoEn,
    },
  });

  const partes: Buffer[] = [];
  const listo = new Promise<Buffer>((resolver, rechazar) => {
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () => resolver(Buffer.concat(partes)));
    doc.on('error', rechazar);
  });

  encabezado(doc, informe, metricas);
  contenido(doc, informe.contenido);
  tablasDeMetricas(doc, metricas);
  doc.end();
  return listo;
}
