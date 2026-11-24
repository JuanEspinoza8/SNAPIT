/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Se leen como texto: Vitest no procesa el CSS, y un import con ?raw llega vacío. La ruta va en una variable: con
// un texto fijo, Vite cambia `new URL(..., import.meta.url)` por la URL de un recurso.
const enDisco = (ruta: string) => fileURLToPath(new URL(ruta, import.meta.url));
const leer = (ruta: string) => readFileSync(enDisco(ruta), 'utf8');
const tema = leer('../src/compartido/tema/tema.css');
const estilos = leer('../src/estilos.css');
const indexHtml = leer('../index.html');

/** El código de las pantallas, para ver cómo se combinan los colores (sin los datos simulados). */
const pantallas = readdirSync(enDisco('../src/'), { recursive: true, encoding: 'utf8' })
  .map((ruta) => ruta.replaceAll('\\', '/'))
  .filter((ruta) => /\.tsx?$/.test(ruta) && !ruta.includes('/mocks/'))
  .map((ruta) => ({ ruta, codigo: leer(`../src/${ruta}`) }));

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
  // El botón que confirma una eliminación.
  ['sobre-peligro', 'peligro'],
  // Las listas y tablas de los paneles (.tabla y .lista-filas): el encabezado y las dos filas.
  ['sobre-lista-encabezado', 'lista-encabezado'],
  ['texto', 'fila'],
  ['texto', 'fila-alterna'],
  ['texto', 'fila-resaltada'],
  ['texto-secundario-fila', 'fila'],
  ['texto-secundario-fila', 'fila-alterna'],
  ['texto-secundario-fila', 'fila-resaltada'],
  ['primario', 'fila'],
  ['primario', 'fila-alterna'],
  ['peligro', 'fila'],
  ['peligro', 'fila-alterna'],
  // Las tarjetas de los paneles (.tarjeta).
  ['texto', 'tarjeta'],
  ['texto-secundario-fila', 'tarjeta'],
  ['primario', 'tarjeta'],
  ['peligro', 'tarjeta'],
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

describe('cómo se combinan en las pantallas', () => {
  it('nada usa blanco o negro sueltos: van los tokens, que cambian con el tema', () => {
    const sueltos = pantallas.flatMap(({ ruta, codigo }) =>
      [...codigo.matchAll(/\b(?:text|bg|border)-(?:white|black)\b/g)].map(([clase]) => `${ruta}: ${clase}`),
    );
    expect(sueltos).toEqual([]);
  });

  // Un estado o una gravedad como color de texto (no de fondo) va sobre la superficie, que cambia con el tema.
  const estadosComoTexto = [
    ...new Set(
      pantallas.flatMap(({ codigo }) =>
        [...codigo.matchAll(/\btext-((?:estado|gravedad)-[a-z-]+)/g)].map(([, token]) => token!),
      ),
    ),
  ];

  it.each([
    ['claro', claro],
    ['oscuro', oscuro],
  ])('los estados usados como texto dan 4,5:1 o más sobre las superficies del tema %s', (_tema, paleta) => {
    for (const token of estadosComoTexto) {
      for (const fondo of ['superficie', 'superficie-alterna']) {
        expect(contraste(paleta[token]!, paleta[fondo]!), `${token} sobre ${fondo}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });
});

describe('lo que va sobre el mapa, que es claro en los dos temas', () => {
  // El fondo del mapa de OpenStreetMap: el blanco de las calles y el crema de las manzanas.
  const FONDOS_DEL_MAPA = ['#ffffff', '#f2efe9'];

  it.each(FONDOS_DEL_MAPA)('el trazo de los marcadores da 3:1 o más sobre %s', (fondo) => {
    expect(contraste(claro['marcador-trazo']!, fondo)).toBeGreaterThanOrEqual(3);
  });

  it('el número de los grupos se lee sobre su círculo', () => {
    expect(contraste(claro['marcador-borde']!, claro['marcador-trazo']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('ningún marcador usa el primario, que en el oscuro es claro', () => {
    const reglas = [...estilos.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, selector]) =>
      selector!.includes('marcador'),
    );
    expect(reglas.length).toBeGreaterThan(0);
    for (const [, selector, cuerpo] of reglas) expect(cuerpo, selector).not.toContain('primario');

    const iconos = pantallas.flatMap(({ ruta, codigo }) =>
      [...codigo.matchAll(/html:\s*(['`])([\s\S]*?)\1/g)].map(([, , html]) => ({ ruta, html: html! })),
    );
    expect(iconos.length).toBeGreaterThan(0);
    for (const { ruta, html } of iconos) expect(html, ruta).not.toContain('primario');
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
