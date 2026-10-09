import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { crearAgrupador, ZOOM_MAXIMO } from './agrupar.js';
import { ESTADOS } from './estados.js';
import type { PuntoMapa, Rectangulo } from './tipos.js';

/** Centro de Neuquén capital. */
const CENTRO_INICIAL: [number, number] = [-38.9516, -68.0591];
const ZOOM_INICIAL = 14;

export interface Vista {
  rectangulo: Rectangulo;
  zoom: number;
}

interface Props {
  puntos: PuntoMapa[];
  alCambiarVista: (vista: Vista) => void;
  alElegir: (id: number) => void;
  /** Varios incidentes tan juntos que acercando no se separan: se muestran en una lista. */
  alElegirVarios: (puntos: PuntoMapa[]) => void;
}

function leerVista(mapa: L.Map): Vista {
  const limites = mapa.getBounds();
  return {
    rectangulo: {
      oeste: limites.getWest(),
      sur: limites.getSouth(),
      este: limites.getEast(),
      norte: limites.getNorth(),
    },
    zoom: mapa.getZoom(),
  };
}

/** Avisa la vista al cargar el mapa y cada vez que se termina de mover o hacer zoom. */
function SeguirVista({ alCambiar }: { alCambiar: (vista: Vista) => void }) {
  const mapa = useMapEvents({ moveend: () => alCambiar(leerVista(mapa)) });
  useEffect(() => {
    alCambiar(leerVista(mapa));
  }, [mapa, alCambiar]);
  return null;
}

/** Los marcadores son HTML (divIcon): se arman con clases de estilos.css, sin imágenes. */
function iconoGrupo(cantidad: number) {
  const tamano = cantidad < 10 ? 34 : cantidad < 100 ? 42 : 50;
  return L.divIcon({
    className: '',
    html: `<div class="marcador-grupo" style="width:${tamano}px;height:${tamano}px">${cantidad}</div>`,
    iconSize: [tamano, tamano],
  });
}

function iconoPunto(punto: PuntoMapa) {
  // En revisión además se dibuja con borde punteado: no depende solo del color.
  const revision = punto.enRevision ? ' marcador-punto--revision' : '';
  return L.divIcon({
    className: '',
    html: `<div class="marcador-punto ${ESTADOS[punto.estado].clase}${revision}"></div>`,
    iconSize: [26, 26],
  });
}

function Marcadores({ puntos, alElegir, alElegirVarios }: Omit<Props, 'alCambiarVista'>) {
  const mapa = useMap();
  const [vista, setVista] = useState<Vista>(() => leerVista(mapa));
  useMapEvents({ moveend: () => setVista(leerVista(mapa)) });

  const agrupar = useMemo(() => crearAgrupador(puntos), [puntos]);

  return agrupar(vista.rectangulo, vista.zoom).map((elemento) => {
    if (elemento.tipo === 'grupo') {
      return (
        <Marker
          key={elemento.clave}
          position={[elemento.lat, elemento.lon]}
          icon={iconoGrupo(elemento.cantidad)}
          title={`${elemento.cantidad} incidentes. Acercar para verlos`}
          eventHandlers={{ click: () => mapa.setView([elemento.lat, elemento.lon], elemento.zoomParaAbrir) }}
        />
      );
    }
    if (elemento.tipo === 'superpuestos') {
      return (
        <Marker
          key={elemento.clave}
          position={[elemento.lat, elemento.lon]}
          icon={iconoGrupo(elemento.puntos.length)}
          title={`${elemento.puntos.length} incidentes en el mismo lugar. Ver la lista`}
          eventHandlers={{ click: () => alElegirVarios(elemento.puntos) }}
        />
      );
    }
    return (
      <Marker
        key={elemento.clave}
        position={[elemento.punto.lat, elemento.punto.lon]}
        icon={iconoPunto(elemento.punto)}
        // El título lleva el estado en texto: lo leen el lector de pantalla y el cartel al pasar el mouse.
        title={`${elemento.punto.categoriaNombre}: ${ESTADOS[elemento.punto.estado].etiqueta}`}
        eventHandlers={{ click: () => alElegir(elemento.punto.id) }}
      />
    );
  });
}

export function MapaIncidentes({ puntos, alCambiarVista, alElegir, alElegirVarios }: Props) {
  return (
    <MapContainer center={CENTRO_INICIAL} zoom={ZOOM_INICIAL} maxZoom={ZOOM_MAXIMO} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={ZOOM_MAXIMO}
      />
      <SeguirVista alCambiar={alCambiarVista} />
      <Marcadores puntos={puntos} alElegir={alElegir} alElegirVarios={alElegirVarios} />
    </MapContainer>
  );
}
