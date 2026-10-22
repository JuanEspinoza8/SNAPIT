import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

/// Gravedad que declara el vecino (`severidad` en la base).
enum Severidad {
  leve('LEVE', 'Leve'),
  moderada('MODERADA', 'Moderada'),
  grave('GRAVE', 'Grave');

  const Severidad(this.valorApi, this.etiqueta);

  /// Lanza [FormatException] si la API manda un valor que la app no conoce.
  factory Severidad.desdeApi(String valor) => values.firstWhere(
    (severidad) => severidad.valorApi == valor,
    orElse: () => throw FormatException('Gravedad desconocida: $valor'),
  );

  final String valorApi;
  final String etiqueta;
}

/// Lo que respondió `POST /ia/clasificar-foto` para la foto del borrador.
@immutable
class SugerenciaIa {
  const SugerenciaIa({
    required this.categoriaId,
    required this.severidad,
    required this.registroIaId,
  });

  factory SugerenciaIa.desdeJson(Map<String, dynamic> json) => SugerenciaIa(
    categoriaId: json['categoriaId'] as int,
    severidad: Severidad.desdeApi(json['severidad'] as String),
    registroIaId: json['registroIaId'] as int,
  );

  final int categoriaId;
  final Severidad severidad;

  /// La consulta que quedó en `registro_ia`: el servidor la usa para
  /// comprobar la sugerencia y guardar si el vecino la aceptó.
  final int registroIaId;
}

/// En qué está la sugerencia de la foto actual.
enum EstadoSugerencia {
  /// No hay foto, o se envió el reporte sin esperarla.
  ninguna,
  buscando,
  lista,

  /// Falló o no respondió: el vecino elige a mano.
  noDisponible,
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
    this.sugerencia,
    this.estadoSugerencia = EstadoSugerencia.ninguna,
    this.categoriaEsSugerida = false,
    this.severidadEsSugerida = false,
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

  /// La sugerencia de la foto actual. Se envía aunque el vecino la cambie:
  /// así el servidor guarda si la aceptó.
  final SugerenciaIa? sugerencia;
  final EstadoSugerencia estadoSugerencia;

  /// True si el valor lo completó la sugerencia y el vecino no lo cambió.
  final bool categoriaEsSugerida;
  final bool severidadEsSugerida;

  BorradorReporte copyWith({
    FotoReporte? foto,
    int? categoriaId,
    Severidad? severidad,
    String? descripcion,
    LatLng? punto,
    bool? puntoMovido,
    DateTime? registradoEn,
    EstadoSugerencia? estadoSugerencia,
    bool? categoriaEsSugerida,
    bool? severidadEsSugerida,
  }) {
    return BorradorReporte(
      foto: foto ?? this.foto,
      categoriaId: categoriaId ?? this.categoriaId,
      severidad: severidad ?? this.severidad,
      descripcion: descripcion ?? this.descripcion,
      punto: punto ?? this.punto,
      puntoMovido: puntoMovido ?? this.puntoMovido,
      registradoEn: registradoEn ?? this.registradoEn,
      sugerencia: sugerencia,
      estadoSugerencia: estadoSugerencia ?? this.estadoSugerencia,
      categoriaEsSugerida: categoriaEsSugerida ?? this.categoriaEsSugerida,
      severidadEsSugerida: severidadEsSugerida ?? this.severidadEsSugerida,
    );
  }

  /// Con otra foto se espera otra sugerencia. La anterior era de la foto
  /// vieja: se descarta, y con ella lo que había completado y el vecino no
  /// cambió. Lo que eligió el vecino se queda.
  BorradorReporte conFotoNueva(FotoReporte foto) => BorradorReporte(
    foto: foto,
    categoriaId: categoriaEsSugerida ? null : categoriaId,
    severidad: severidadEsSugerida ? null : severidad,
    descripcion: descripcion,
    punto: punto,
    puntoMovido: puntoMovido,
    registradoEn: registradoEn,
    estadoSugerencia: EstadoSugerencia.buscando,
  );

  /// Completa con la sugerencia solo los campos vacíos: el vecino tiene la
  /// última palabra. La categoría, además, solo si está en la lista que ve
  /// el vecino ([categoriaDisponible]); si no, quedaría elegida sin verse.
  BorradorReporte conSugerencia(
    SugerenciaIa sugerencia, {
    required bool categoriaDisponible,
  }) {
    final completarCategoria = categoriaId == null && categoriaDisponible;
    final completarSeveridad = severidad == null;
    return BorradorReporte(
      foto: foto,
      categoriaId: completarCategoria ? sugerencia.categoriaId : categoriaId,
      severidad: completarSeveridad ? sugerencia.severidad : severidad,
      descripcion: descripcion,
      punto: punto,
      puntoMovido: puntoMovido,
      registradoEn: registradoEn,
      sugerencia: sugerencia,
      estadoSugerencia: EstadoSugerencia.lista,
      categoriaEsSugerida: completarCategoria,
      severidadEsSugerida: completarSeveridad,
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
      // Los tres o ninguno, como pide la API.
      if (sugerencia case final sugerencia?) ...{
        'categoriaSugeridaId': '${sugerencia.categoriaId}',
        'severidadSugerida': sugerencia.severidad.valorApi,
        'registroIaId': '${sugerencia.registroIaId}',
      },
    };
  }
}
