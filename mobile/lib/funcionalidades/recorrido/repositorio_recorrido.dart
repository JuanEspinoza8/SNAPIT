import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/red/cliente_api.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/red/interceptor_sesion.dart';
import 'modelos.dart';

final repositorioRecorridoProvider = Provider<RepositorioRecorrido>(
  (ref) => RepositorioRecorrido(ref.watch(clienteApiProvider)),
);

/// La zona y los perfiles casi no cambian: se piden una vez por ejecución.
final zonasPilotoProvider = FutureProvider<List<ZonaPiloto>>(
  (ref) => ref.watch(repositorioRecorridoProvider).zonasPiloto(),
);

final perfilesProvider = FutureProvider<List<PerfilMovilidad>>(
  (ref) => ref.watch(repositorioRecorridoProvider).perfiles(),
);

/// Lo que se le pide a `GET /recorridos`. Si cambia algo (por ejemplo, el
/// perfil), es otra consulta y se vuelve a calcular.
typedef ConsultaRecorrido = ({LatLng origen, LatLng destino, int perfilId});

final recorridoProvider = FutureProvider.autoDispose
    .family<Recorrido, ConsultaRecorrido>(
      (ref, consulta) =>
          ref.watch(repositorioRecorridoProvider).recorrido(consulta),
    );

/// Lo que encuentra `GET /geocodificacion` para ese texto.
final lugaresProvider = FutureProvider.autoDispose
    .family<List<LugarEncontrado>, String>(
      (ref, texto) =>
          ref.watch(repositorioRecorridoProvider).buscarLugares(texto),
    );

/// Un punto como lo pide la API: "lat,lon".
String puntoApi(LatLng punto) =>
    '${punto.latitude.toStringAsFixed(6)},${punto.longitude.toStringAsFixed(6)}';

class RepositorioRecorrido {
  RepositorioRecorrido(this._dio);

  final Dio _dio;

  // La zona y los perfiles son públicos: así un token vencido no dispara una
  // renovación. El recorrido y la búsqueda piden sesión.
  Options get _sinSesion => Options(extra: {InterceptorSesion.sinSesion: true});

  Future<List<ZonaPiloto>> zonasPiloto() {
    return _pedir(() async {
      final respuesta = await _dio.get<Map<String, dynamic>>(
        '/zona-piloto',
        options: _sinSesion,
      );
      return ZonaPiloto.desdeGeoJson(respuesta.data!);
    });
  }

  Future<List<PerfilMovilidad>> perfiles() {
    return _pedir(() async {
      final respuesta = await _dio.get<Map<String, dynamic>>(
        '/perfiles-movilidad',
        options: _sinSesion,
      );
      return [
        for (final perfil in respuesta.data!['perfiles'] as List)
          PerfilMovilidad.desdeJson(perfil as Map<String, dynamic>),
      ];
    });
  }

  Future<Recorrido> recorrido(ConsultaRecorrido consulta) {
    return _pedir(() async {
      final respuesta = await _dio.get<Map<String, dynamic>>(
        '/recorridos',
        queryParameters: {
          'origen': puntoApi(consulta.origen),
          'destino': puntoApi(consulta.destino),
          'perfilId': '${consulta.perfilId}',
        },
      );
      return Recorrido.desdeJson(respuesta.data!);
    });
  }

  Future<List<LugarEncontrado>> buscarLugares(String texto) {
    return _pedir(() async {
      final respuesta = await _dio.get<Map<String, dynamic>>(
        '/geocodificacion',
        queryParameters: {'texto': texto},
      );
      return [
        for (final lugar in respuesta.data!['lugares'] as List)
          LugarEncontrado.desdeJson(lugar as Map<String, dynamic>),
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
