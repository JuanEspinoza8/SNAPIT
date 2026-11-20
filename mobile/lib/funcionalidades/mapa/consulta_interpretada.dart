import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import 'modelos.dart';

final repositorioConsultasProvider = Provider<RepositorioConsultas>(
  (ref) => RepositorioConsultas(ref.watch(clienteApiProvider)),
);

@immutable
class ConsultaInterpretada {
  const ConsultaInterpretada({
    required this.filtros,
    required this.descripcion,
    required this.registroIaId,
  });

  factory ConsultaInterpretada.desdeJson(Map<String, dynamic> json) {
    final datos = json['filtros'] as Map<String, dynamic>;

    DateTime? dia(Object? valor) =>
        valor == null ? null : DateTime.parse('${valor}T00:00:00');

    return ConsultaInterpretada(
      filtros: FiltrosMapa(
        categoriaId: (datos['categoriaId'] as num?)?.toInt(),
        estado: datos['estado'] == null
            ? null
            : EstadoVisible.desdeApi(datos['estado'] as String),
        desde: dia(datos['desde']),
        hasta: dia(datos['hasta']),
        barrio: datos['barrio'] as String?,
      ),
      descripcion: json['descripcion'] as String,
      registroIaId: json['registroIaId'] as int,
    );
  }

  final FiltrosMapa filtros;
  final String descripcion;
  final int registroIaId;
}

class RepositorioConsultas {
  RepositorioConsultas(this._dio);

  final Dio _dio;

  static const _tiempoEspera = Duration(seconds: 35);

  Future<ConsultaInterpretada> interpretar(String texto) => _pedir(() async {
        final respuesta = await _dio.post<Map<String, dynamic>>(
          '/consultas/interpretar',
          data: {'texto': texto.trim()},
          options: Options(receiveTimeout: _tiempoEspera),
        );
        return ConsultaInterpretada.desdeJson(respuesta.data!);
      });

  Future<T> _pedir<T>(Future<T> Function() pedido) async {
    try {
      return await pedido();
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}