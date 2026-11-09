import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/error_api.dart';
import '../../compartido/sesion/sesion.dart';
import 'modelos.dart';
import 'repositorio_avisos.dart';

/// Los avisos del usuario, del más nuevo al más viejo.
final avisosProvider = AsyncNotifierProvider<Avisos, List<Aviso>>(Avisos.new);

class Avisos extends AsyncNotifier<List<Aviso>> {
  @override
  Future<List<Aviso>> build() async {
    final usuario = ref.watch(sesionProvider).value;
    if (usuario == null) return const [];
    return ref.read(repositorioAvisosProvider).listar();
  }

  /// Vuelve a pedir la lista. Si falla, la deja con el error para que la
  /// pantalla lo muestre.
  Future<void> recargar() async {
    if (ref.read(sesionProvider).value == null) {
      state = const AsyncData<List<Aviso>>([]);
      return;
    }
    state = await AsyncValue.guard(
      () => ref.read(repositorioAvisosProvider).listar(),
    );
  }

  /// Marca el aviso como leído en la pantalla al instante y después avisa al
  /// servidor. Si el servidor falla, vuelve a como estaba.
  Future<void> marcarLeida(Aviso aviso) async {
    if (aviso.leida) return;
    final anteriores = state.value ?? const <Aviso>[];
    final ahora = DateTime.now();
    state = AsyncData([
      for (final actual in anteriores)
        actual.id == aviso.id ? actual.marcarLeida(ahora) : actual,
    ]);
    try {
      await ref.read(repositorioAvisosProvider).marcarLeida(aviso.id);
    } catch (error) {
      state = AsyncData(anteriores);
      rethrow;
    }
  }
}

/// Cuántos avisos quedan sin leer, para el badge de la barra superior.
final avisosNoLeidosProvider = Provider<int>((ref) {
  final avisos = ref.watch(avisosProvider).value;
  return avisos?.where((aviso) => !aviso.leida).length ?? 0;
});

/// Si el vecino sigue ese incidente.
final seguimientoProvider = FutureProvider.autoDispose.family<bool, int>(
  (ref, incidenteId) => ref.watch(repositorioAvisosProvider).sigue(incidenteId),
);

/// Las zonas del vecino. Se vuelven a pedir cada vez que se abre la pantalla.
final zonasHabitualesProvider = FutureProvider.autoDispose<List<ZonaHabitual>>(
  (ref) => ref.watch(repositorioAvisosProvider).zonas(),
);

/// Las categorías de avisos, con actualización optimista.
final preferenciasProvider =
    AsyncNotifierProvider.autoDispose<
      PreferenciasNotifier,
      List<PreferenciaCategoria>
    >(PreferenciasNotifier.new);

class PreferenciasNotifier extends AsyncNotifier<List<PreferenciaCategoria>> {
  @override
  Future<List<PreferenciaCategoria>> build() =>
      ref.watch(repositorioAvisosProvider).preferencias();

  Future<void> cambiar(int categoriaId, bool habilitada) async {
    final antes = state.value;
    if (antes == null) return;

    state = AsyncData([
      for (final preferencia in antes)
        preferencia.categoriaId == categoriaId
            ? preferencia.copyWith(habilitada: habilitada)
            : preferencia,
    ]);

    try {
      final guardadas = await ref
          .read(repositorioAvisosProvider)
          .guardarPreferencias([
            PreferenciaCategoria(
              categoriaId: categoriaId,
              habilitada: habilitada,
            ),
          ]);
      if (ref.mounted) state = AsyncData(guardadas);
    } on ErrorApi {
      if (ref.mounted) state = AsyncData(antes);
      rethrow;
    }
  }
}
