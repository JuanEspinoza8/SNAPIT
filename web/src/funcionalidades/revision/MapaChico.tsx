import L from 'leaflet';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  lat: number;
  lon: number;
}

// Uno solo para todos los mapas: crearlo en cada render hacía que Leaflet redibujara el marcador.
const ICONO_PUNTO = L.divIcon({
  className: '',
  html: '<div class="marcador-punto bg-primario"></div>',
  iconSize: [26, 26],
});

/** El punto del reporte en un mapa chico, solo para mirar (F04). */
export function MapaChico({ lat, lon }: Props) {
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={16}
      className="h-48 w-full rounded-md border border-borde"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lon]} icon={ICONO_PUNTO} />
    </MapContainer>
  );
}
