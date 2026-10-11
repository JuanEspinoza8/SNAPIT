import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

/// Gravedad que declara el vecino (`severidad` en la base).
enum Severidad {
  leve('LEVE', 'Leve'),
  moderada('MODERADA', 'Moderada'),
  grave('GRAVE', 'Grave');

  const Severidad(this.valorApi, this.etiqueta);

  final String valorApi;
  final String etiqueta;
}

@immutable
class FotoReporte {
  const FotoReporte({required this.ruta, required this.tomadaConCamaraApp});

  /// El archivo original en el teléfono, tal como lo entregó la cámara o la
  /// galería.
  final String ruta;

  /// True solo si se sacó con el botón de la cámara de la app.
  final bool tomadaConCamaraApp;
}

/// Las partes del formulario, para ubicar debajo de cada una su error.
enum CampoReporte {
  foto,
  categoria,
  severidad,
  descripcion,
  ubicacion;

  /// El campo de la pantalla al que corresponde un `detalle` de la API. Null
  /// si la pantalla no lo muestra (por ejemplo, `registradoEn`).
  static CampoReporte? desdeApi(String campo) => switch (campo) {
    'foto' => foto,
    'categoriaId' => categoria,
    'severidadDeclarada' => severidad,
    'descripcion' => descripcion,
    'lat' || 'lon' => ubicacion,
    _ => null,
  };
}

/// El reporte mientras el vecino lo carga. Se envía con un
/// `RepositorioReportes`; si el envío falla, queda igual para reintentar.
@immutable
class BorradorReporte {
  const BorradorReporte({
    this.foto,
    this.categoriaId,
    this.severidad,
    this.descripcion = '',
    this.punto,
    this.puntoMovido = false,
    this.registradoEn,
  });

  final FotoReporte? foto;
  final int? categoriaId;
  final Severidad? severidad;
  final String descripcion;

  /// El punto que se envía: el del GPS o el que eligió el vecino en el mapa.
  final LatLng? punto;

  /// True si el vecino corrigió el punto del GPS.
  final bool puntoMovido;

  /// Cuándo lo cargó el vecino. Se fija al tocar «Enviar» la primera vez y no
  /// cambia en los reintentos.
  final DateTime? registradoEn;

  BorradorReporte copyWith({
    FotoReporte? foto,
    int? categoriaId,
    Severidad? severidad,
    String? descripcion,
    LatLng? punto,
    bool? puntoMovido,
    DateTime? registradoEn,
  }) {
    return BorradorReporte(
      foto: foto ?? this.foto,
      categoriaId: categoriaId ?? this.categoriaId,
      severidad: severidad ?? this.severidad,
      descripcion: descripcion ?? this.descripcion,
      punto: punto ?? this.punto,
      puntoMovido: puntoMovido ?? this.puntoMovido,
      registradoEn: registradoEn ?? this.registradoEn,
    );
  }

  /// Lo que falta para poder enviar, con el mensaje de cada campo.
  Map<CampoReporte, String> get faltantes => {
    if (foto == null)
      CampoReporte.foto: 'Sacá una foto o elegí una de la galería',
    if (categoriaId == null) CampoReporte.categoria: 'Elegí una categoría',
    if (severidad == null) CampoReporte.severidad: 'Elegí la gravedad',
    if (punto == null) CampoReporte.ubicacion: 'Falta la ubicación',
  };

  /// Los campos de texto de `POST /reportes` (la foto va aparte). Solo se
  /// llama con el borrador completo.
  Map<String, String> campos() {
    assert(faltantes.isEmpty, 'Al borrador le falta: ${faltantes.keys}');
    final texto = descripcion.trim();
    return {
      'categoriaId': '$categoriaId',
      'severidadDeclarada': severidad!.valorApi,
      if (texto.isNotEmpty) 'descripcion': texto,
      'lat': '${punto!.latitude}',
      'lon': '${punto!.longitude}',
      'origen': 'APP_MOVIL',
      // En UTC, con la «Z» que el servidor pide como zona horaria.
      if (registradoEn case final fecha?)
        'registradoEn': fecha.toUtc().toIso8601String(),
      'tomadaConCamaraApp': '${foto!.tomadaConCamaraApp}',
    };
  }
}
