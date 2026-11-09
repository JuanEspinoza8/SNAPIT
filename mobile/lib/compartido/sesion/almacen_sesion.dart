import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final almacenSesionProvider = Provider<AlmacenSesion>((ref) => AlmacenSesion());

/// Guarda los tokens de la sesión en el almacenamiento cifrado del teléfono.
class AlmacenSesion {
  AlmacenSesion([FlutterSecureStorage almacen = const FlutterSecureStorage()])
    : _almacen = almacen;

  final FlutterSecureStorage _almacen;

  static const _claveAcceso = 'tokenAcceso';
  static const _claveRenovacion = 'tokenRenovacion';
  static const _clavePush = 'tokenPush';

  Future<String?> leerTokenAcceso() => _almacen.read(key: _claveAcceso);

  Future<String?> leerTokenRenovacion() => _almacen.read(key: _claveRenovacion);

  /// El token de avisos del celular (FCM), para darlo de baja al salir.
  Future<String?> leerTokenPush() => _almacen.read(key: _clavePush);

  Future<void> guardar({
    required String tokenAcceso,
    required String tokenRenovacion,
  }) async {
    await _almacen.write(key: _claveAcceso, value: tokenAcceso);
    await _almacen.write(key: _claveRenovacion, value: tokenRenovacion);
  }

  Future<void> guardarTokenPush(String tokenPush) =>
      _almacen.write(key: _clavePush, value: tokenPush);

  Future<void> borrar() async {
    await _almacen.delete(key: _claveAcceso);
    await _almacen.delete(key: _claveRenovacion);
    await _almacen.delete(key: _clavePush);
  }
}
