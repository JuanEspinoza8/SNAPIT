import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/reportar/selector_foto.dart';

void main() {
  test('sin permiso de cámara ofrece la galería', () {
    expect(
      mensajeErrorFoto('camera_access_denied', FuenteFoto.camara),
      contains('elegí una foto de la galería'),
    );
  });

  test('sin cámara en el teléfono ofrece la galería', () {
    expect(
      mensajeErrorFoto('no_available_camera', FuenteFoto.camara),
      'No se encontró una cámara en el teléfono. Elegí una foto de la galería.',
    );
  });

  test('cualquier otro error dice qué no se pudo abrir', () {
    expect(
      mensajeErrorFoto('desconocido', FuenteFoto.camara),
      'No se pudo abrir la cámara. Intentá de nuevo.',
    );
    expect(
      mensajeErrorFoto('desconocido', FuenteFoto.galeria),
      'No se pudo abrir la galería. Intentá de nuevo.',
    );
  });
}
