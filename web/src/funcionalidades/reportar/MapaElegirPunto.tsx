import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const CENTRO_INICIAL: [number, number] = [-38.9516, -68.0591];
const ZOOM_INICIAL = 15;

export interface Punto {
  lat: number;
  lon: number;
}

interface Props {
  punto: Punto | null;
  /** Llevar el mapa al punto: cuando lo marcó la foto, puede estar fuera de lo que se ve. */
  centrar?: boolean;
  alElegirPunto: (lat: number, lon: number) => void;
}

function iconoPunto() {
  return L.divIcon({
    className: '',
    html: '<div class="marcador-punto bg-primario"></div>',
    iconSize: [26, 26],
  });
}

function CapturarClic({ alElegirPunto }: { alElegirPunto: Props['alElegirPunto'] }) {
  useMapEvents({
    click: (evento) => {
      // Leaflet no recorta la longitud: en otra copia del mundo podría dar -428 y el servidor la rechaza.
      const { lat, lng } = evento.latlng.wrap();
      alElegirPunto(lat, lng);
    },
  });
  return null;
}

/** Lleva el mapa al punto cada vez que cambia. */
function Centrar({ punto }: { punto: Punto }) {
  const mapa = useMap();
  useEffect(() => {
    mapa.setView([punto.lat, punto.lon], Math.max(mapa.getZoom(), 17));
  }, [mapa, punto.lat, punto.lon]);
  return null;
}

export function MapaElegirPunto({ punto, centrar = false, alElegirPunto }: Props) {
  return (
    <MapContainer center={CENTRO_INICIAL} zoom={ZOOM_INICIAL} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CapturarClic alElegirPunto={alElegirPunto} />
      {punto && centrar && <Centrar punto={punto} />}
      {punto && <Marker position={[punto.lat, punto.lon]} icon={iconoPunto()} />}
    </MapContainer>
  );
}
