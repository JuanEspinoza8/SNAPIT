import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/red/interceptor_sesion.dart';
import 'modelos.dart';

final repositorioFeedProvider = Provider<RepositorioFeed>(
  (ref) => RepositorioFeed(ref.watch(clienteApiProvider)),
);

/// `GET /incidentes/feed`. Pública, igual que el mapa: va sin sesión para que
/// un token vencido no dispare una renovación.
class RepositorioFeed {
  RepositorioFeed(this._dio);

  /// En el celular entran dos o tres tarjetas por pantalla: diez alcanzan
  /// para que el scroll no espere a la red.
  static const porPagina = 10;

  final Dio _dio;

  Future<PaginaFeed> pagina({String? cursor}) async {
    try {
      final respuesta = await _dio.get<Map<String, dynamic>>(
        '/incidentes/feed',
        queryParameters: {'limite': porPagina, 'cursor': ?cursor},
        options: Options(extra: {InterceptorSesion.sinSesion: true}),
      );
      return PaginaFeed.desdeJson(respuesta.data!);
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
