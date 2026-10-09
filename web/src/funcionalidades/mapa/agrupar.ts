import Supercluster from 'supercluster';
import type { PuntoMapa, Rectangulo } from './tipos.js';

/** Zoom máximo del mapa: hasta ahí llegan las teselas de OpenStreetMap. */
export const ZOOM_MAXIMO = 18;

/**
 * Lo que se dibuja: un punto suelto, un grupo que se separa al acercar o varios incidentes tan
 * juntos que ni con el zoom máximo se separan (por ejemplo, dos vecinos que reportaron el mismo pozo).
 */
export type ElementoMapa =
  | { tipo: 'punto'; clave: string; punto: PuntoMapa }
  | { tipo: 'grupo'; clave: string; lat: number; lon: number; cantidad: number; zoomParaAbrir: number }
  | { tipo: 'superpuestos'; clave: string; lat: number; lon: number; puntos: PuntoMapa[] };

/** Radio, en píxeles de pantalla, dentro del cual dos puntos se juntan en un grupo. */
const RADIO_PX = 60;

/**
 * Agrupa los puntos según el zoom: alejado, los cercanos se juntan en un círculo con la cantidad;
 * acercado, se separan. Devuelve una función que calcula qué dibujar para cada vista.
 */
export function crearAgrupador(puntos: PuntoMapa[]) {
  // Se agrupa también en el zoom máximo: si no, los puntos muy juntos quedan uno encima del otro.
  const indice = new Supercluster<{ punto: PuntoMapa }>({ radius: RADIO_PX, maxZoom: ZOOM_MAXIMO });
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
          const zoomParaAbrir = indice.getClusterExpansionZoom(id);
          if (zoomParaAbrir > ZOOM_MAXIMO) {
            const puntosDelGrupo = indice
              .getLeaves(id, Infinity)
              .map((hoja) => (hoja.properties as { punto: PuntoMapa }).punto);
            return { tipo: 'superpuestos', clave: `superpuestos-${id}`, lat, lon, puntos: puntosDelGrupo };
          }
          return {
            tipo: 'grupo',
            clave: `grupo-${id}`,
            lat,
            lon,
            cantidad: elemento.properties.point_count,
            zoomParaAbrir,
          };
        }
        const { punto } = elemento.properties as { punto: PuntoMapa };
        return { tipo: 'punto', clave: `punto-${punto.id}`, punto };
      });
}
