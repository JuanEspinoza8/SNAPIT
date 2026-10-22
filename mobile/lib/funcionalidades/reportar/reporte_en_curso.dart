import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/sesion/sesion.dart';
import '../mapa/repositorio_mapa.dart';
import '../mis_reportes/repositorio_mis_reportes.dart';
import 'borrador_reporte.dart';
import 'repositorio_reportes.dart';
import 'repositorio_sugerencia.dart';
import 'selector_foto.dart';

/// El borrador que el vecino está cargando. Vive fuera de la pantalla: si el
/// envío falla o se cambia de pestaña, lo cargado sigue ahí.
final reporteEnCursoProvider =
    NotifierProvider<ReporteEnCurso, BorradorReporte>(ReporteEnCurso.new);

class ReporteEnCurso extends Notifier<BorradorReporte> {
  CancelToken? _pedidoSugerencia;

  @override
  BorradorReporte build() {
    // Si sale la cuenta o entra otra, el borrador arranca vacío.
    ref.watch(sesionProvider.select((sesion) => sesion.value?.id));
    return const BorradorReporte();
  }

  /// Pone la foto y pide su sugerencia sin esperarla: mientras tanto el
  /// vecino puede completar el resto y enviar.
  void ponerFoto(String ruta, FuenteFoto fuente) {
    _pedidoSugerencia?.cancel();
    final foto = FotoReporte(
      ruta: ruta,
      tomadaConCamaraApp: fuente == FuenteFoto.camara,
    );
    state = state.conFotoNueva(foto);
    _pedirSugerencia(foto);
  }

  Future<void> _pedirSugerencia(FotoReporte foto) async {
    final cancelar = _pedidoSugerencia = CancelToken();
    try {
      final sugerencia = await ref
          .read(repositorioSugerenciaProvider)
          .pedir(foto.ruta, cancelar: cancelar);
      if (!_esperando(foto)) return;
      final categorias = ref.read(categoriasProvider).value ?? const [];
      state = state.conSugerencia(
        sugerencia,
        categoriaDisponible: categorias.any(
          (categoria) => categoria.id == sugerencia.categoriaId,
        ),
      );
    } catch (_) {
      // Sea cual sea el motivo, el vecino sigue a mano.
      if (_esperando(foto)) {
        state = state.copyWith(estadoSugerencia: EstadoSugerencia.noDisponible);
      }
    }
  }

  /// Si la respuesta todavía sirve: no cambió la foto, no se envió el reporte
  /// y no cambió la sesión.
  bool _esperando(FotoReporte foto) =>
      ref.mounted &&
      identical(state.foto, foto) &&
      state.estadoSugerencia == EstadoSugerencia.buscando;

  void ponerCategoria(int id) =>
      state = state.copyWith(categoriaId: id, categoriaEsSugerida: false);

  void ponerSeveridad(Severidad severidad) =>
      state = state.copyWith(severidad: severidad, severidadEsSugerida: false);

  void ponerDescripcion(String texto) =>
      state = state.copyWith(descripcion: texto);

  void ponerPuntoDelGps(LatLng punto) =>
      state = state.copyWith(punto: punto, puntoMovido: false);

  void moverPunto(LatLng punto) =>
      state = state.copyWith(punto: punto, puntoMovido: true);

  /// Envía el borrador completo. Si sale bien, lo vacía y recarga el mapa y
  /// mis reportes para que aparezca el reporte; si falla, lo deja como estaba
  /// (con su fecha de registro) y relanza el error.
  Future<ReporteEnviado> enviar() async {
    // No se espera la sugerencia: sale con lo que eligió el vecino, y lo que
    // se envía no cambia mientras sube.
    if (state.estadoSugerencia == EstadoSugerencia.buscando) {
      _pedidoSugerencia?.cancel();
      state = state.copyWith(estadoSugerencia: EstadoSugerencia.ninguna);
    }
    final borrador = state.registradoEn == null
        ? state.copyWith(registradoEn: DateTime.now())
        : state;
    state = borrador;
    final enviado = await ref
        .read(repositorioReportesProvider)
        .enviar(borrador);
    ref.invalidate(incidentesProvider);
    ref.invalidate(misReportesProvider);
    state = const BorradorReporte();
    return enviado;
  }
}
