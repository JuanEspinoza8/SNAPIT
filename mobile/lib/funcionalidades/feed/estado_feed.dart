import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/error_api.dart';
import '../../compartido/sesion/sesion.dart';
import 'modelos.dart';
import 'repositorio_feed.dart';

/// Lo que ya se cargó del feed y cómo viene la página siguiente.
class EstadoFeed {
  const EstadoFeed({
    required this.publicaciones,
    required this.siguiente,
    this.cargandoMas = false,
    this.errorMas,
  });

  final List<Publicacion> publicaciones;
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
    // En la app el feed está en la pantalla principal, que siempre tiene
    // sesión. Al salir no se pide nada; al entrar con otra cuenta, de nuevo.
    final usuario = ref.watch(sesionProvider.select((s) => s.value?.id));
    if (usuario == null) {
      return const EstadoFeed(publicaciones: [], siguiente: null);
    }
    final pagina = await ref
        .read(repositorioFeedProvider)
        .pagina(conSesion: true);
    return EstadoFeed(
      publicaciones: pagina.publicaciones,
      siguiente: pagina.siguiente,
    );
  }

  /// Pide la página siguiente, si hay y no se está pidiendo ya.
  Future<void> cargarMas() async {
    final actual = state.value;
    if (actual == null || !actual.hayMas || actual.cargandoMas) return;
    state = AsyncData(
      EstadoFeed(
        publicaciones: actual.publicaciones,
        siguiente: actual.siguiente,
        cargandoMas: true,
      ),
    );
    try {
      final pagina = await ref
          .read(repositorioFeedProvider)
          .pagina(cursor: actual.siguiente, conSesion: true);
      if (!ref.mounted) return;
      state = AsyncData(
        EstadoFeed(
          publicaciones: [...actual.publicaciones, ...pagina.publicaciones],
          siguiente: pagina.siguiente,
        ),
      );
    } on ErrorApi catch (error) {
      if (!ref.mounted) return;
      state = AsyncData(
        EstadoFeed(
          publicaciones: actual.publicaciones,
          siguiente: actual.siguiente,
          errorMas: error,
        ),
      );
    }
  }

  /// Cambia los contadores de una publicación ya cargada, después de dar me
  /// gusta o comentar: así el feed no vuelve a la primera página.
  void actualizar(
    int reporteId, {
    bool? yaMeGusta,
    int? cantidadMeGusta,
    int? cantidadComentarios,
  }) {
    final actual = state.value;
    if (actual == null) return;
    state = AsyncData(
      EstadoFeed(
        publicaciones: [
          for (final p in actual.publicaciones)
            p.id == reporteId
                ? p.con(
                    yaMeGusta: yaMeGusta,
                    cantidadMeGusta: cantidadMeGusta,
                    cantidadComentarios: cantidadComentarios,
                  )
                : p,
        ],
        siguiente: actual.siguiente,
        cargandoMas: actual.cargandoMas,
        errorMas: actual.errorMas,
      ),
    );
  }

  /// Vuelve a la primera página, para ver lo nuevo. Mientras tanto se sigue
  /// viendo lo que había.
  Future<void> recargar() async {
    ref.invalidateSelf();
    await future.then<void>((_) {}, onError: (_) {});
  }
}
