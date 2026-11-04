import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Claro u oscuro. Arranca en oscuro y recuerda lo que eligió cada uno.
final modoTemaProvider = NotifierProvider<ModoTemaNotifier, ThemeMode>(
  ModoTemaNotifier.new,
);

/// El tema guardado, leído antes de abrir la app (`main.dart`), así la
/// primera pantalla ya sale con el que eligió cada uno. Null: no se leyó
/// antes (los tests), y el tema se corrige apenas se lee.
final modoTemaGuardadoProvider = Provider<ThemeMode?>((_) => null);

class ModoTemaNotifier extends Notifier<ThemeMode> {
  // El mismo almacenamiento que la sesión: es lo que ya trae la app. Va con
  // su propia clave, así que salir de la cuenta no lo borra.
  static const _clave = 'modoTema';
  static const _almacen = FlutterSecureStorage();

  /// Lo que quedó guardado: oscuro, salvo que se haya elegido el claro. Si
  /// no se puede leer, oscuro.
  static Future<ThemeMode> leerGuardado() async {
    try {
      final guardado = await _almacen.read(key: _clave);
      return guardado == 'claro' ? ThemeMode.light : ThemeMode.dark;
    } catch (_) {
      return ThemeMode.dark;
    }
  }

  @override
  ThemeMode build() {
    if (ref.read(modoTemaGuardadoProvider) case final guardado?) {
      return guardado;
    }
    _corregirAlLeer();
    return ThemeMode.dark;
  }

  Future<void> _corregirAlLeer() async {
    final guardado = await leerGuardado();
    if (ref.mounted) state = guardado;
  }

  Future<void> elegir({required bool oscuro}) async {
    state = oscuro ? ThemeMode.dark : ThemeMode.light;
    await _almacen.write(key: _clave, value: oscuro ? 'oscuro' : 'claro');
  }
}

/// El botón del encabezado que pasa de un tema al otro. Dice a cuál lleva,
/// no en cuál está, igual que en la web.
class BotonTema extends ConsumerWidget {
  const BotonTema({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final oscuro = ref.watch(modoTemaProvider) == ThemeMode.dark;
    return IconButton(
      tooltip: oscuro ? 'Usar el tema claro' : 'Usar el tema oscuro',
      icon: Icon(oscuro ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
      onPressed: () =>
          ref.read(modoTemaProvider.notifier).elegir(oscuro: !oscuro),
    );
  }
}
