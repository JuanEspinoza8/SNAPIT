import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/red/interceptor_sesion.dart';
import 'modelos.dart';

final repositorioFeedProvider = Provider<RepositorioFeed>(
  (ref) => RepositorioFeed(ref.watch(clienteApiProvider)),
);

/// `GET /social/feed`: las publicaciones de los vecinos. Pública, igual que
/// el mapa: sin sesión va sin token, para que uno vencido no dispare una
/// renovación. Con sesión lo manda, así cada publicación dice si ya le diste
/// me gusta.
class RepositorioFeed {
  RepositorioFeed(this._dio);

  /// En el celular entran una o dos publicaciones por pantalla: diez alcanzan
  /// para que el scroll no espere a la red.
  static const porPagina = 10;

  final Dio _dio;

  Future<PaginaFeed> pagina({String? cursor, bool conSesion = false}) async {
    try {
      final respuesta = await _dio.get<Map<String, dynamic>>(
        '/social/feed',
        queryParameters: {'limite': porPagina, 'cursor': ?cursor},
        options: Options(extra: {InterceptorSesion.sinSesion: !conSesion}),
      );
      return PaginaFeed.desdeJson(respuesta.data!);
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
