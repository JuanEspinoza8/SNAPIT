import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/sesion/sesion.dart';
import '../mapa/repositorio_mapa.dart';
import '../mis_reportes/repositorio_mis_reportes.dart';
import 'borrador_reporte.dart';
import 'repositorio_reportes.dart';
import 'selector_foto.dart';

/// El borrador que el vecino está cargando. Vive fuera de la pantalla: si el
/// envío falla o se cambia de pestaña, lo cargado sigue ahí.
final reporteEnCursoProvider =
    NotifierProvider<ReporteEnCurso, BorradorReporte>(ReporteEnCurso.new);

class ReporteEnCurso extends Notifier<BorradorReporte> {
  @override
  BorradorReporte build() {
    // Si sale la cuenta o entra otra, el borrador arranca vacío.
    ref.watch(sesionProvider.select((sesion) => sesion.value?.id));
    return const BorradorReporte();
  }

  void ponerFoto(String ruta, FuenteFoto fuente) {
    state = state.copyWith(
      foto: FotoReporte(
        ruta: ruta,
        tomadaConCamaraApp: fuente == FuenteFoto.camara,
      ),
    );
  }

  void ponerCategoria(int id) => state = state.copyWith(categoriaId: id);

  void ponerSeveridad(Severidad severidad) =>
      state = state.copyWith(severidad: severidad);

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
