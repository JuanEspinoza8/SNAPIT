import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/error_api.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/sesion/usuario.dart';
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
      // Solo los del vecino que tiene la sesión: en un teléfono compartido,
      // los de otro usuario esperan a que él vuelva a ingresar.
      final usuario = _ref.read(sesionProvider).value;
      if (usuario == null || usuario.rol != Rol.vecino) return;

      for (final pendiente in await _cola.leer()) {
        if (pendiente.usuarioId != usuario.id || pendiente.rechazado) continue;
        try {
          await _api.enviar(pendiente.borrador);
          await _cola.quitar(pendiente.id);
        } on ErrorApi catch (error) {
          if (!esRechazoDefinitivo(error)) break;
          // Reintentarlo daría lo mismo: queda con el motivo para que el
          // vecino lo vea y lo descarte.
          await _cola.marcarRechazado(pendiente.id, motivoDelRechazo(error));
        }
        await _ref.read(reportesPendientesProvider.notifier).actualizar();
      }
    } finally {
      _sincronizando = false;
    }
  }

  void cerrar() => _conexion?.cancel();
}

/// Un rechazo que no cambia al reintentar: datos que el servidor no acepta
/// (400, 403, 404, 409, 413, 422...) o la foto que ya no está en el teléfono.
/// Sin conexión, la sesión vencida (401), el límite de pedidos (408, 429) o
/// una falla del servidor (5xx) son pasajeros: se reintenta la próxima vez.
bool esRechazoDefinitivo(ErrorApi error) {
  if (error.codigo == 'FOTO_NO_DISPONIBLE') return true;
  final status = error.status;
  return status != null &&
      status >= 400 &&
      status < 500 &&
      !const {401, 408, 429}.contains(status);
}

/// Lo que se le muestra al vecino: el detalle del campo si lo hay («No existe
/// o no está activa»), que dice más que el mensaje general («Hay datos
/// inválidos»).
String motivoDelRechazo(ErrorApi error) =>
    error.detalles.firstOrNull?.mensaje ?? error.mensaje;
