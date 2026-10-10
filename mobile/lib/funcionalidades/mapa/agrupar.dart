import 'package:latlong2/latlong.dart';
import 'package:supercluster/supercluster.dart';

import 'modelos.dart';

/// Zoom máximo del mapa: hasta ahí llegan las teselas de OpenStreetMap.
const zoomMaximo = 18;

/// Radio, en píxeles de pantalla, dentro del cual dos puntos se juntan.
/// Es el mismo que usa la web.
const _radioPx = 60;

/// Lo que se dibuja en el mapa para una vista.
sealed class ElementoMapa {
  const ElementoMapa();

  LatLng get posicion;
}

class PuntoSuelto extends ElementoMapa {
  const PuntoSuelto(this.punto);

  final PuntoMapa punto;

  @override
  LatLng get posicion => LatLng(punto.lat, punto.lon);
}

/// Varios puntos cercanos que se separan al acercar el mapa a [zoomParaAbrir].
class Grupo extends ElementoMapa {
  const Grupo({
    required this.posicion,
    required this.cantidad,
    required this.zoomParaAbrir,
  });

  @override
  final LatLng posicion;
  final int cantidad;
  final int zoomParaAbrir;
}

/// Incidentes tan juntos que ni con el zoom máximo se separan (por ejemplo,
/// dos vecinos que reportaron el mismo pozo). Se eligen de una lista.
class Superpuestos extends ElementoMapa {
  const Superpuestos({required this.posicion, required this.puntos});

  @override
  final LatLng posicion;
  final List<PuntoMapa> puntos;
}

typedef Agrupador = List<ElementoMapa> Function(Rectangulo vista, double zoom);

/// Agrupa los puntos según el zoom: alejado, los cercanos se juntan en un
/// círculo con la cantidad; acercado, se separan. El índice se arma una vez
/// por lista de puntos y la función que devuelve calcula qué dibujar en cada
/// vista. Es el mismo algoritmo (supercluster) y la misma configuración que en
/// la web.
Agrupador crearAgrupador(List<PuntoMapa> puntos) {
  // Se agrupa también en el zoom máximo: si no, los puntos muy juntos quedan
  // uno encima del otro y solo se puede tocar el de arriba.
  final indice = SuperclusterImmutable<PuntoMapa>(
    getX: (punto) => punto.lon,
    getY: (punto) => punto.lat,
    radius: _radioPx,
    maxZoom: zoomMaximo,
  )..load(puntos);

  return (vista, zoom) => [
    for (final elemento in indice.search(
      vista.oeste,
      vista.sur,
      vista.este,
      vista.norte,
      zoom.round(),
    ))
      elemento.handle(
        point: (punto) => PuntoSuelto(punto.originalPoint),
        cluster: (grupo) =>
            _desdeGrupo(indice, grupo as ImmutableLayerCluster<PuntoMapa>),
      ),
  ];
}

ElementoMapa _desdeGrupo(
  SuperclusterImmutable<PuntoMapa> indice,
  ImmutableLayerCluster<PuntoMapa> grupo,
) {
  final posicion = LatLng(grupo.latitude, grupo.longitude);
  final zoomParaAbrir = indice.expansionZoomOf(grupo.id);
  if (zoomParaAbrir > zoomMaximo) {
    return Superpuestos(
      posicion: posicion,
      puntos: [
        for (final hoja in indice.pointsWithin(
          grupo.id,
          limit: grupo.childPointCount,
        ))
          hoja.originalPoint,
      ],
    );
  }
  return Grupo(
    posicion: posicion,
    cantidad: grupo.childPointCount,
    zoomParaAbrir: zoomParaAbrir,
  );
}
