import Supercluster from 'supercluster';
import type { PuntoMapa, Rectangulo } from './tipos.js';

export type ElementoMapa =
  | { tipo: 'grupo'; clave: string; lat: number; lon: number; cantidad: number; zoomParaAbrir: number }
  | { tipo: 'punto'; clave: string; punto: PuntoMapa };

/** Radio, en píxeles de pantalla, dentro del cual dos puntos se juntan en un grupo. */
const RADIO_PX = 60;
/** Desde este zoom (nivel de cuadra) ya no se agrupa: cada punto se ve suelto. */
const ZOOM_SIN_AGRUPAR = 17;

/**
 * Agrupa los puntos según el zoom: alejado, los cercanos se juntan en un círculo con la cantidad;
 * acercado, se separan. Devuelve una función que calcula qué dibujar para cada vista.
 */
export function crearAgrupador(puntos: PuntoMapa[]) {
  const indice = new Supercluster<{ punto: PuntoMapa }>({ radius: RADIO_PX, maxZoom: ZOOM_SIN_AGRUPAR - 1 });
  indice.load(
    puntos.map((punto) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [punto.lon, punto.lat] },
      properties: { punto },
    })),
  );

  return (vista: Rectangulo, zoom: number): ElementoMapa[] =>
    indice
      .getClusters([vista.oeste, vista.sur, vista.este, vista.norte], Math.round(zoom))
      .map((elemento) => {
        const [lon, lat] = elemento.geometry.coordinates as [number, number];
        if ('cluster' in elemento.properties && elemento.properties.cluster) {
          const id = elemento.properties.cluster_id;
          return {
            tipo: 'grupo',
            clave: `grupo-${id}`,
            lat,
            lon,
            cantidad: elemento.properties.point_count,
            zoomParaAbrir: indice.getClusterExpansionZoom(id),
          };
        }
        const { punto } = elemento.properties as { punto: PuntoMapa };
        return { tipo: 'punto', clave: `punto-${punto.id}`, punto };
      });
}
