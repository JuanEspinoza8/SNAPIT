import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Claro u oscuro. Arranca en oscuro y recuerda lo que eligió cada uno.
final modoTemaProvider = NotifierProvider<ModoTemaNotifier, ThemeMode>(
  ModoTemaNotifier.new,
);

class ModoTemaNotifier extends Notifier<ThemeMode> {
  // El mismo almacenamiento que la sesión: es lo que ya trae la app. Va con
  // su propia clave, así que salir de la cuenta no lo borra.
  static const _clave = 'modoTema';
  static const _almacen = FlutterSecureStorage();

  @override
  ThemeMode build() {
    _leerGuardado();
    return ThemeMode.dark;
  }

  Future<void> _leerGuardado() async {
    final guardado = await _almacen.read(key: _clave);
    if (!ref.mounted) return;
    if (guardado == 'claro') state = ThemeMode.light;
  }

  Future<void> elegir({required bool oscuro}) async {
    state = oscuro ? ThemeMode.dark : ThemeMode.light;
    await _almacen.write(key: _clave, value: oscuro ? 'oscuro' : 'claro');
  }
}
