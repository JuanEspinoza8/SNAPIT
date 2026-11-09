import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final avisosPospuestosProvider = Provider<AvisosPospuestos>(
  (ref) => AvisosPospuestos(),
);

/// Recuerda si el vecino eligió «Ahora no» cuando la app le explicó para qué
/// son los avisos, así no se le vuelve a preguntar cada vez que la abre.
class AvisosPospuestos {
  AvisosPospuestos([
    FlutterSecureStorage almacen = const FlutterSecureStorage(),
  ]) : _almacen = almacen;

  final FlutterSecureStorage _almacen;

  // Va con su propia clave, como el tema: es del teléfono, no de la cuenta,
  // así que salir no lo borra.
  static const _clave = 'avisosPospuestos';

  /// Si no se puede leer, se pregunta de nuevo.
  Future<bool> leer() async {
    try {
      return await _almacen.read(key: _clave) == 'si';
    } catch (_) {
      return false;
    }
  }

  Future<void> guardar() => _almacen.write(key: _clave, value: 'si');
}
