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

  Future<String?> leerTokenAcceso() => _almacen.read(key: _claveAcceso);

  Future<String?> leerTokenRenovacion() => _almacen.read(key: _claveRenovacion);

  Future<void> guardar({
    required String tokenAcceso,
    required String tokenRenovacion,
  }) async {
    await _almacen.write(key: _claveAcceso, value: tokenAcceso);
    await _almacen.write(key: _claveRenovacion, value: tokenRenovacion);
  }

  Future<void> borrar() async {
    await _almacen.delete(key: _claveAcceso);
    await _almacen.delete(key: _claveRenovacion);
  }
}
