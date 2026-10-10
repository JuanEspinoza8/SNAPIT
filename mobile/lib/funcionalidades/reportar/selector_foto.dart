import 'dart:developer' as developer;

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

/// En los tests se reemplaza por uno que devuelve una foto fija.
final selectorFotoProvider = Provider<SelectorFoto>((ref) => SelectorFoto());

enum FuenteFoto { camara, galeria }

class ErrorFoto implements Exception {
  const ErrorFoto(this.mensaje);

  final String mensaje;

  @override
  String toString() => 'ErrorFoto($mensaje)';
}

class SelectorFoto {
  final _selector = ImagePicker();

  /// Abre la cámara del teléfono o la galería y devuelve la ruta de la foto.
  /// Null si la persona volvió sin elegir. Lanza [ErrorFoto] si no se pudo
  /// abrir.
  Future<String?> elegir(FuenteFoto fuente) async {
    try {
      // Sin maxWidth, maxHeight ni imageQuality: así el plugin no achica ni
      // recomprime y devuelve el archivo original, con su EXIF.
      final foto = await _selector.pickImage(
        source: fuente == FuenteFoto.camara
            ? ImageSource.camera
            : ImageSource.gallery,
      );
      return foto?.path;
    } on PlatformException catch (e) {
      developer.log('No se pudo elegir la foto', name: 'reporte', error: e);
      throw ErrorFoto(mensajeErrorFoto(e.code, fuente));
    }
  }
}

/// Qué decirle a la persona según el error del plugin.
String mensajeErrorFoto(String codigo, FuenteFoto fuente) => switch (codigo) {
  // La app no pide el permiso de cámara (usa la app de cámara del sistema),
  // pero si algún día se agrega y se niega, el plugin responde esto.
  'camera_access_denied' =>
    'SnapIt no tiene permiso para usar la cámara. Habilitalo en los ajustes '
        'del teléfono o elegí una foto de la galería.',
  'no_available_camera' =>
    'No se encontró una cámara en el teléfono. Elegí una foto de la galería.',
  _ when fuente == FuenteFoto.camara =>
    'No se pudo abrir la cámara. Intentá de nuevo.',
  _ => 'No se pudo abrir la galería. Intentá de nuevo.',
};
