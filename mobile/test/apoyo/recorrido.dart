import 'package:latlong2/latlong.dart';

// Respuestas de la API para el recorrido accesible (docs/api.md).

const zonaPilotoJson = {
  'type': 'FeatureCollection',
  'features': [
    {
      'type': 'Feature',
      'id': 1,
      'properties': {'nombre': 'Bouquet Roldán y La Sirena'},
      'geometry': {
        'type': 'Polygon',
        'coordinates': [
          [
            [-68.09023, -38.96258],
            [-68.08277, -38.96258],
            [-68.08277, -38.95542],
            [-68.09023, -38.95542],
            [-68.09023, -38.96258],
          ],
        ],
      },
    },
  ],
};

const perfilesJson = {
  'perfiles': [
    {'id': 1, 'nombre': 'Silla de ruedas', 'descripcion': null},
    {'id': 2, 'nombre': 'Bastón o andador', 'descripcion': null},
  ],
};

/// Dentro de la zona: cerca del hospital y de la Escuela Primaria N° 132.
const origenEnZona = LatLng(-38.9584, -68.0859);
const destinoEnZona = LatLng(-38.9601, -68.0897);

Map<String, Object?> recorridoJson({required int metros}) => {
  'distanciaMetros': metros,
  'minutosEstimados': (metros / 50).ceil(),
  'geometria': {
    'type': 'LineString',
    'coordinates': [
      [origenEnZona.longitude, origenEnZona.latitude],
      [-68.0880, -38.9590],
      [destinoEnZona.longitude, destinoEnZona.latitude],
    ],
  },
};

const lugaresJson = {
  'lugares': [
    {
      'nombre': 'Cornelio Saavedra 500, La Sirena',
      'lat': -38.9601,
      'lon': -68.0897,
    },
  ],
};
