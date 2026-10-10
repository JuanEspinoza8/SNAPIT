import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/formato/fechas.dart';
import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/red/interceptor_sesion.dart';
import 'modelos.dart';

final repositorioMapaProvider = Provider<RepositorioMapa>(
  (ref) => RepositorioMapa(ref.watch(clienteApiProvider)),
);

/// Lo que se le pide a `GET /incidentes`. Dos consultas iguales comparten la
/// respuesta.
typedef ConsultaIncidentes = ({FiltrosMapa filtros, Rectangulo vista});

final incidentesProvider = FutureProvider.autoDispose
    .family<List<PuntoMapa>, ConsultaIncidentes>(
      (ref, consulta) =>
          ref.watch(repositorioMapaProvider).incidentes(consulta),
    );

final fichaProvider = FutureProvider.autoDispose.family<FichaIncidente, int>(
  (ref, id) => ref.watch(repositorioMapaProvider).ficha(id),
);

/// Las categorías casi no cambian: se piden una vez por ejecución.
final categoriasProvider = FutureProvider<List<Categoria>>(
  (ref) => ref.watch(repositorioMapaProvider).categorias(),
);

/// Parámetros de `GET /incidentes` (contrato en `docs/api.md`).
Map<String, String> parametrosIncidentes(ConsultaIncidentes consulta) {
  final ConsultaIncidentes(:filtros, :vista) = consulta;
  return {
    'bbox': [
      vista.oeste,
      vista.sur,
      vista.este,
      vista.norte,
    ].map((v) => v.toStringAsFixed(4)).join(','),
    if (filtros.categoriaId case final id?) 'categoriaId': '$id',
    if (filtros.estado case final estado?) 'estado': estado.valorApi,
    if (filtros.desde case final desde?) 'desde': fechaApi(desde),
    if (filtros.hasta case final hasta?) 'hasta': fechaApi(hasta),
  };
}

/// Rutas del mapa público. Todas sin sesión, igual que en la web: son
/// públicas y así un token vencido no dispara una renovación.
class RepositorioMapa {
  RepositorioMapa(this._dio);

  final Dio _dio;

  Options get _sinSesion => Options(extra: {InterceptorSesion.sinSesion: true});

  Future<List<PuntoMapa>> incidentes(ConsultaIncidentes consulta) {
    return _pedir(() async {
      final respuesta = await _dio.get<Map<String, dynamic>>(
        '/incidentes',
        queryParameters: parametrosIncidentes(consulta),
        options: _sinSesion,
      );
      return [
        for (final punto in respuesta.data!['incidentes'] as List)
          PuntoMapa.desdeJson(punto as Map<String, dynamic>),
      ];
    });
  }

  Future<FichaIncidente> ficha(int id) {
    return _pedir(() async {
      final respuesta = await _dio.get<Map<String, dynamic>>(
        '/incidentes/$id',
        options: _sinSesion,
      );
      return FichaIncidente.desdeJson(respuesta.data!);
    });
  }

  Future<List<Categoria>> categorias() {
    return _pedir(() async {
      final respuesta = await _dio.get<Map<String, dynamic>>(
        '/categorias',
        options: _sinSesion,
      );
      return [
        for (final categoria in respuesta.data!['categorias'] as List)
          Categoria.desdeJson(categoria as Map<String, dynamic>),
      ];
    });
  }

  Future<T> _pedir<T>(Future<T> Function() pedido) async {
    try {
      return await pedido();
    } catch (e) {
      throw ErrorApi.desde(e);
    }
  }
}
