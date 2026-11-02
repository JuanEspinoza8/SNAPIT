import { z } from 'zod';

// zona_piloto.nombre es varchar(120).
const LARGO_NOMBRE = 120;

// GeoJSON escribe cada punto como [longitud, latitud].
const punto = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const anillo = z
  .array(punto)
  .min(4, 'un anillo necesita al menos 4 puntos')
  .refine(
    (puntos) => JSON.stringify(puntos[0]) === JSON.stringify(puntos.at(-1)),
    'el anillo tiene que terminar en el mismo punto en que empieza',
  );

const esquema = z.object({
  type: z.literal('FeatureCollection'),
  features: z
    .array(
      z.object({
        type: z.literal('Feature'),
        properties: z.object({ nombre: z.string().trim().min(1).max(LARGO_NOMBRE) }),
        geometry: z.object({ type: z.literal('Polygon'), coordinates: z.array(anillo).min(1) }),
      }),
    )
    .min(1, 'no hay ninguna zona')
    .refine(
      (zonas) => new Set(zonas.map((zona) => zona.properties.nombre)).size === zonas.length,
      'hay dos zonas con el mismo nombre',
    ),
});

export interface ZonaPilotoArchivo {
  nombre: string;
  geometria: z.infer<typeof esquema>['features'][number]['geometry'];
}

/**
 * Lee el GeoJSON de las zonas piloto (`db/datos/zona-piloto.geojson`): un FeatureCollection con un polígono
 * y un nombre por zona. Lanza un error que dice qué está mal. Que el polígono sea válido (que no se cruce
 * a sí mismo) lo controla la base al cargarlo, con ST_IsValid.
 */
export function leerZonasPiloto(texto: string): ZonaPilotoArchivo[] {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error('El archivo de zonas piloto no es JSON');
  }
  const datos = esquema.safeParse(json);
  if (!datos.success) {
    const problemas = datos.error.issues.map(
      (p) => (p.path.length ? `${p.path.join('.')}: ` : '') + p.message,
    );
    throw new Error(`El archivo de zonas piloto no tiene la forma esperada (${problemas.join('; ')})`);
  }
  return datos.data.features.map((zona) => ({ nombre: zona.properties.nombre, geometria: zona.geometry }));
}
