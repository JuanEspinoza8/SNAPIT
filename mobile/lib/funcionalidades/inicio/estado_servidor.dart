import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';

/// Respuesta de `GET /api/salud`.
class EstadoServidor {
  const EstadoServidor({required this.baseDeDatosOk});

  factory EstadoServidor.desdeJson(Map<String, dynamic> json) =>
      EstadoServidor(baseDeDatosOk: json['baseDeDatos'] == 'ok');

  final bool baseDeDatosOk;
}

final estadoServidorProvider = FutureProvider.autoDispose<EstadoServidor>((
  ref,
) async {
  try {
    final respuesta = await ref
        .watch(clienteApiProvider)
        .get<Map<String, dynamic>>('/salud');
    return EstadoServidor.desdeJson(respuesta.data ?? const {});
  } on DioException catch (e) {
    throw ErrorApi.desde(e);
  }
});
