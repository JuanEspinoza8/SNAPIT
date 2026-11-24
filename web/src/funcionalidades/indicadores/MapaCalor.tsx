import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { PuntoCalor } from './tipos.js';

/** Centro de Neuquén capital, como el mapa de incidentes. */
const CENTRO: [number, number] = [-38.9516, -68.0591];

// Un solo tono, de claro a oscuro: más oscuro es más urgente. El mapa es claro en los dos temas, así que
// la escala no cambia con el tema.
const GRADIENTE = { 0.2: '#fdd0a2', 0.45: '#fd8d3c', 0.7: '#e6550d', 1: '#a63603' };

/**
 * leaflet.heat es un script viejo que se cuelga de la `L` global: se la deja a mano y recién después se carga.
 * La promesa es una sola para todo el panel.
 */
let cargarCalor: Promise<unknown> | null = null;
function cargarLeafletHeat() {
  (globalThis as { L?: typeof L }).L = L;
  cargarCalor ??= import('leaflet.heat');
  return cargarCalor;
}

function CapaCalor({ puntos }: { puntos: PuntoCalor[] }) {
  const mapa = useMap();
  useEffect(() => {
    let capa: L.Layer | null = null;
    let vigente = true;
    void cargarLeafletHeat().then(() => {
      if (!vigente) return;
      capa = L.heatLayer(
        puntos.map((punto) => [punto.lat, punto.lon, punto.peso] as [number, number, number]),
        { radius: 28, blur: 22, maxZoom: 16, max: 1, minOpacity: 0.35, gradient: GRADIENTE },
      ).addTo(mapa);
      // Que se vean todos: el mapa se acomoda a los puntos.
      if (puntos.length > 0) {
        mapa.fitBounds(L.latLngBounds(puntos.map((punto) => [punto.lat, punto.lon])), {
          padding: [32, 32],
          maxZoom: 15,
        });
      }
    });
    return () => {
      vigente = false;
      capa?.remove();
    };
  }, [mapa, puntos]);
  return null;
}

/** Dónde se concentran los incidentes abiertos, pesados por su prioridad (F13). */
export function MapaCalor({ puntos }: { puntos: PuntoCalor[] }) {
  return (
    <MapContainer center={CENTRO} zoom={13} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CapaCalor puntos={puntos} />
    </MapContainer>
  );
}

/** La leyenda de la escala, en texto: el color solo no alcanza. */
export function LeyendaCalor() {
  return (
    <div className="flex items-center gap-2 text-xs text-texto-secundario">
      <span>Menos urgente</span>
      <span
        aria-hidden="true"
        className="h-2 w-24 rounded-full"
        style={{ background: `linear-gradient(to right, ${Object.values(GRADIENTE).join(', ')})` }}
      />
      <span>Más urgente</span>
    </div>
  );
}
