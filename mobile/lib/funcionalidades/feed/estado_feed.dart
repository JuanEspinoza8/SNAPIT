import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/error_api.dart';
import 'modelos.dart';
import 'repositorio_feed.dart';

/// Lo que ya se cargó del feed y cómo viene la página siguiente.
class EstadoFeed {
  const EstadoFeed({
    required this.tarjetas,
    required this.siguiente,
    this.cargandoMas = false,
    this.errorMas,
  });

  final List<TarjetaFeed> tarjetas;
  final String? siguiente;
  final bool cargandoMas;

  /// Falló la página siguiente: lo ya cargado se sigue viendo.
  final ErrorApi? errorMas;

  bool get hayMas => siguiente != null;
}

/// No se descarta al cambiar de pestaña: al volver, el feed sigue donde
/// estaba.
final feedProvider = AsyncNotifierProvider<FeedNotifier, EstadoFeed>(
  FeedNotifier.new,
);

class FeedNotifier extends AsyncNotifier<EstadoFeed> {
  @override
  Future<EstadoFeed> build() async {
    final pagina = await ref.read(repositorioFeedProvider).pagina();
    return EstadoFeed(tarjetas: pagina.tarjetas, siguiente: pagina.siguiente);
  }

  /// Pide la página siguiente, si hay y no se está pidiendo ya.
  Future<void> cargarMas() async {
    final actual = state.value;
    if (actual == null || !actual.hayMas || actual.cargandoMas) return;
    state = AsyncData(
      EstadoFeed(
        tarjetas: actual.tarjetas,
        siguiente: actual.siguiente,
        cargandoMas: true,
      ),
    );
    try {
      final pagina = await ref
          .read(repositorioFeedProvider)
          .pagina(cursor: actual.siguiente);
      if (!ref.mounted) return;
      state = AsyncData(
        EstadoFeed(
          tarjetas: [...actual.tarjetas, ...pagina.tarjetas],
          siguiente: pagina.siguiente,
        ),
      );
    } on ErrorApi catch (error) {
      if (!ref.mounted) return;
      state = AsyncData(
        EstadoFeed(
          tarjetas: actual.tarjetas,
          siguiente: actual.siguiente,
          errorMas: error,
        ),
      );
    }
  }

  /// Vuelve a la primera página, para ver lo nuevo. Mientras tanto se sigue
  /// viendo lo que había.
  Future<void> recargar() async {
    ref.invalidateSelf();
    await future.then<void>((_) {}, onError: (_) {});
  }
}
