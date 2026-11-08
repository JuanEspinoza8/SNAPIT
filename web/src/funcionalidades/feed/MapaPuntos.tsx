import L from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ESTADOS } from '../mapa/estados.js';
import type { EstadoVisible } from '../mapa/tipos.js';

export interface PuntoFeed {
  id: number;
  lat: number;
  lon: number;
  estado: EstadoVisible;
  titulo: string;
}

interface Props {
  puntos: PuntoFeed[];
  /** El que se resalta: más grande y adelante. */
  destacado?: number | null;
  alElegir?: (id: number) => void;
  /** Sin arrastrar ni hacer zoom: para ubicarse, no para navegar. */
  fijo?: boolean;
}

const icono = (estado: EstadoVisible, destacado: boolean) =>
  L.divIcon({
    className: '',
    html: `<div class="marcador-punto ${ESTADOS[estado].clase}"${
      destacado ? ' style="transform:scale(1.4)"' : ''
    }></div>`,
    iconSize: [26, 26],
  });

/** Encuadra todos los puntos cada vez que cambian (por ejemplo, al cargar otra página del feed). */
function Encuadrar({ puntos }: { puntos: PuntoFeed[] }) {
  const mapa = useMap();
  const clave = puntos.map((p) => p.id).join(',');
  useEffect(() => {
    if (puntos.length === 0) return;
    if (puntos.length === 1) {
      mapa.setView([puntos[0]!.lat, puntos[0]!.lon], 16);
      return;
    }
    mapa.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lon])), { padding: [24, 24], maxZoom: 16 });
    // Solo cuando cambia qué puntos hay, no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, clave]);
  return null;
}

/** El mapa chico del feed y del detalle. Leaflet es pesado: se carga con la página que lo usa. */
export function MapaPuntos({ puntos, destacado = null, alElegir, fijo = false }: Props) {
  const centro: [number, number] = puntos[0] ? [puntos[0].lat, puntos[0].lon] : [-38.9516, -68.0591];
  return (
    <MapContainer
      center={centro}
      zoom={15}
      className="h-full w-full"
      dragging={!fijo}
      scrollWheelZoom={!fijo}
      doubleClickZoom={!fijo}
      touchZoom={!fijo}
      zoomControl={!fijo}
      keyboard={!fijo}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Encuadrar puntos={puntos} />
      {puntos.map((punto) => (
        <Marker
          key={punto.id}
          position={[punto.lat, punto.lon]}
          icon={icono(punto.estado, punto.id === destacado)}
          zIndexOffset={punto.id === destacado ? 1000 : 0}
          title={punto.titulo}
          eventHandlers={alElegir ? { click: () => alElegir(punto.id) } : undefined}
        />
      ))}
    </MapContainer>
  );
}
