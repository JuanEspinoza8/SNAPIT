import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const CENTRO_INICIAL: [number, number] = [-38.9516, -68.0591];
const ZOOM_INICIAL = 15;

export interface Punto {
  lat: number;
  lon: number;
}

interface Props {
  punto: Punto | null;
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
    click: (evento) => alElegirPunto(evento.latlng.lat, evento.latlng.lng),
  });
  return null;
}

export function MapaElegirPunto({ punto, alElegirPunto }: Props) {
  return (
    <MapContainer center={CENTRO_INICIAL} zoom={ZOOM_INICIAL} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CapturarClic alElegirPunto={alElegirPunto} />
      {punto && <Marker position={[punto.lat, punto.lon]} icon={iconoPunto()} />}
    </MapContainer>
  );
}
