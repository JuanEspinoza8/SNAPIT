import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/error_api.dart';
import 'cola_reportes.dart';
import 'repositorio_reportes.dart';

abstract class ServicioConectividad {
  Stream<List<ConnectivityResult>> get onConnectivityChanged;
}

class ConectividadPlus implements ServicioConectividad {
  @override
  Stream<List<ConnectivityResult>> get onConnectivityChanged =>
      Connectivity().onConnectivityChanged;
}

final sincronizadorReportesProvider = Provider<SincronizadorReportes>((ref) {
  final sincronizador = SincronizadorReportes(
    ref.read(repositorioReportesApiProvider),
    ref.read(colaReportesProvider),
    ConectividadPlus(),
    ref,
  );
  ref.onDispose(sincronizador.cerrar);
  return sincronizador;
});

class SincronizadorReportes {
  SincronizadorReportes(this._api, this._cola, this._connectivity, this._ref);

  final RepositorioReportesApi _api;
  final ColaReportes _cola;
  final ServicioConectividad _connectivity;
  final Ref _ref;

  StreamSubscription<List<ConnectivityResult>>? _conexion;
  bool _sincronizando = false;

  void iniciar() {
    _conexion ??= _connectivity.onConnectivityChanged.listen((estados) {
      if (estados.any((estado) => estado != ConnectivityResult.none)) {
        unawaited(sincronizar());
      }
    });
    unawaited(sincronizar());
  }

  Future<void> sincronizar() async {
    if (_sincronizando) return;
    _sincronizando = true;

    try {
      for (final pendiente in await _cola.leer()) {
        try {
          await _api.enviar(pendiente.borrador);
          await _cola.quitar(pendiente.id);
          await _ref.read(reportesPendientesProvider.notifier).actualizar();
        } on ErrorApi catch (error) {
          if (error.codigo == ErrorApi.sinConexion.codigo ||
              error.status == 401) {
            break;
          }
        }
      }
    } finally {
      _sincronizando = false;
    }
  }

  void cerrar() => _conexion?.cancel();
}
