/**
 * Genera las fotos de prueba de esta carpeta. Ya están guardadas en el repo: solo hace falta
 * correrlo si se quiere cambiar alguna. Desde server/:  npx tsx test/fotos/generar.ts
 *
 * Son escenas dibujadas, no fotos reales, para no subir imágenes con dueño. Para que se comporten
 * como una foto de verdad llevan ruido (la compresión JPEG lo trata como textura) y luz despareja:
 * una escena de colores lisos deja la mitad de los bits del dHash librados al azar, algo que en una
 * foto real casi no pasa (ver "Hash perceptual" en docs/calculos.md).
 */
import path from 'node:path';
import sharp from 'sharp';

const ANCHO = 640;
const ALTO = 480;

/** Sol de costado (desde la izquierda o la derecha) y viñeteado de la lente, sobre toda la escena. */
const luz = (solDesde: 'izquierda' | 'derecha') => `
  <defs>
    <linearGradient id="sol" x1="${solDesde === 'izquierda' ? 0 : 1}" y1="0" x2="${solDesde === 'izquierda' ? 1 : 0}" y2="0.3">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.35"/>
    </linearGradient>
    <radialGradient id="vineta" cx="0.45" cy="0.55" r="0.75">
      <stop offset="0.5" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
  </defs>`;
const SOMBRAS = `
  <rect width="100%" height="100%" fill="url(#sol)"/>
  <rect width="100%" height="100%" fill="url(#vineta)"/>`;

/** Calle con un pozo: asfalto en perspectiva, cordón, un poste y una mancha oscura. */
const CALLE = `<svg width="${ANCHO}" height="${ALTO}" xmlns="http://www.w3.org/2000/svg">${luz('izquierda')}
  <rect width="100%" height="100%" fill="#5a5a5a"/>
  <rect y="0" width="100%" height="140" fill="#9cc3e6"/>
  <polygon points="0,140 640,110 640,170 0,190" fill="#b9b2a5"/>
  <rect x="90" y="20" width="14" height="150" fill="#3d3d3d"/>
  <polygon points="250,480 300,190 340,190 450,480" fill="#646464"/>
  <ellipse cx="380" cy="340" rx="150" ry="70" fill="#1e1e1e"/>
  <ellipse cx="360" cy="330" rx="90" ry="35" fill="#3a3530"/>
  <rect x="40" y="400" width="120" height="12" fill="#e8e3c8"/>${SOMBRAS}
</svg>`;

/** Vereda de baldosas con una rota: una escena con otra estructura. */
const VEREDA = `<svg width="${ANCHO}" height="${ALTO}" xmlns="http://www.w3.org/2000/svg">${luz('derecha')}
  <rect width="100%" height="100%" fill="#c9c2b4"/>
  ${Array.from({ length: 8 }, (_, i) => `<rect x="${i * 80}" y="0" width="6" height="100%" fill="#7d7768"/>`).join('')}
  ${Array.from({ length: 6 }, (_, i) => `<rect x="0" y="${i * 80}" width="100%" height="6" fill="#7d7768"/>`).join('')}
  <polygon points="170,90 330,120 300,260 150,230" fill="#4b443a"/>
  <rect x="460" y="300" width="180" height="180" fill="#6e8b4a"/>${SOMBRAS}
</svg>`;

async function escena(svg: string) {
  const ruido = await sharp({
    create: { width: ANCHO, height: ALTO, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } },
  })
    .png()
    .toBuffer();
  return sharp(Buffer.from(svg)).composite([{ input: ruido, blend: 'soft-light' }]);
}

const carpeta = import.meta.dirname;

// Con EXIF completo, como la saca un celular: GPS en Neuquén (38° 57' 6" S, 68° 3' 33" O).
await (
  await escena(CALLE)
)
  .withExif({
    IFD0: { Make: 'Motorola', Model: 'moto g54 5G' },
    IFD2: { DateTimeOriginal: '2026:10:15 14:30:00', OffsetTimeOriginal: '-03:00' },
    IFD3: {
      GPSLatitudeRef: 'S',
      GPSLatitude: '38/1 57/1 6/1',
      GPSLongitudeRef: 'W',
      GPSLongitude: '68/1 3/1 33/1',
    },
  })
  .jpeg({ quality: 90 })
  .toFile(path.join(carpeta, 'calle-con-gps.jpg'));

// Sin ningún metadato, como queda después de pasar por muchas apps de mensajería.
await (await escena(VEREDA)).jpeg({ quality: 90 }).toFile(path.join(carpeta, 'vereda-sin-exif.jpg'));

console.log('Fotos generadas en', carpeta);
