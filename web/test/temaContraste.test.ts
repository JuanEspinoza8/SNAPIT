/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

// Se leen como texto: Vitest no procesa el CSS, y un import con ?raw llega vacío.
const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const tema = leer('../src/compartido/tema/tema.css');
const indexHtml = leer('../index.html');

/** Los colores `--color-x: #rrggbb` de un pedazo de tema.css. */
function colores(bloque: string): Record<string, string> {
  return Object.fromEntries(
    [...bloque.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, nombre, valor]) => [
      nombre!,
      valor!.toLowerCase(),
    ]),
  );
}

const inicioOscuro = tema.indexOf(":root[data-tema='oscuro']");
const claro = colores(tema.slice(0, inicioOscuro));
const oscuro = { ...claro, ...colores(tema.slice(inicioOscuro)) };

// WCAG 2: luminancia relativa y contraste entre dos colores.
function luminancia(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const canal = parseInt(hex.slice(i, i + 2), 16) / 255;
    return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contraste(a: string, b: string) {
  const [clara, oscura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (clara! + 0.05) / (oscura! + 0.05);
}

const TEXTO_SOBRE_FONDO = [
  ['texto', 'superficie'],
  ['texto', 'superficie-alterna'],
  ['texto-secundario', 'superficie'],
  ['texto-secundario', 'superficie-alterna'],
  ['primario', 'superficie'],
  ['primario', 'superficie-alterna'],
  ['peligro', 'superficie'],
  ['peligro', 'superficie-alterna'],
  ['sobre-primario', 'primario'],
  ['sobre-primario', 'peligro'],
] as const;

const CON_TEXTO_SOBRE_ESTADO = [
  'estado-registrado',
  'estado-verificado',
  'estado-derivado',
  'estado-en-ejecucion',
  'estado-resuelto',
  'estado-desestimado',
  'gravedad-leve',
  'gravedad-moderada',
  'gravedad-grave',
];

describe.each([
  ['claro', claro],
  ['oscuro', oscuro],
])('contraste AA del tema %s', (_tema, paleta) => {
  it.each(TEXTO_SOBRE_FONDO)('%s sobre %s da 4,5:1 o más', (texto, fondo) => {
    expect(contraste(paleta[texto]!, paleta[fondo]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CON_TEXTO_SOBRE_ESTADO)('el texto sobre %s da 4,5:1 o más', (fondo) => {
    expect(contraste(paleta['sobre-estado']!, paleta[fondo]!)).toBeGreaterThanOrEqual(4.5);
  });
});

it('«Moderada» no repite el color de «En revisión»: van una al lado de la otra', () => {
  expect(claro['gravedad-moderada']).not.toBe(claro['estado-registrado']);
});

describe('el tema se fija antes de dibujar (index.html)', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)![1]!;

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.tema;
  });

  it('el script va en el head, antes que el código de la página', () => {
    const finDelHead = indexHtml.indexOf('</head>');
    expect(indexHtml.indexOf(script)).toBeLessThan(finDelHead);
    expect(indexHtml.indexOf(script)).toBeLessThan(indexHtml.indexOf('type="module"'));
  });

  it.each([
    [null, 'oscuro'],
    ['claro', 'claro'],
    ['oscuro', 'oscuro'],
    ['otra cosa', 'oscuro'],
  ])('con «%s» guardado arranca en %s', (guardado, esperado) => {
    if (guardado) localStorage.setItem('snapit.tema', guardado);

    // Se corre tal cual está en index.html.
    new Function(script)();

    expect(document.documentElement.dataset.tema).toBe(esperado);
  });
});
