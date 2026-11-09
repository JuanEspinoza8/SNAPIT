import 'dart:async';

import 'package:snapit/funcionalidades/avisos/modelos.dart';
import 'package:snapit/funcionalidades/avisos/servicio_push.dart';

/// Reemplaza a FCM en los tests: no toca los canales nativos y permite
/// simular permisos, tokens y avisos.
class ServicioPushFalso implements ServicioPush {
  ServicioPushFalso({this.permiso = EstadoPermiso.autorizado, this.tokenPush});

  EstadoPermiso permiso;

  /// El token que devuelve [token]. Null: el celular no recibe avisos.
  String? tokenPush;

  /// El aviso que abrió la app desde cero.
  MensajePush? inicial;

  var permisosPedidos = 0;

  final _tokens = StreamController<String>.broadcast();
  final _recibidos = StreamController<MensajePush>.broadcast();
  final _abiertos = StreamController<MensajePush>.broadcast();

  @override
  Future<EstadoPermiso> estadoPermiso() async => permiso;

  @override
  Future<bool> pedirPermiso() async {
    permisosPedidos++;
    if (permiso == EstadoPermiso.denegado) return false;
    permiso = EstadoPermiso.autorizado;
    return true;
  }

  @override
  Future<String?> token() async => tokenPush;

  @override
  Stream<String> get tokensRenovados => _tokens.stream;

  @override
  Stream<MensajePush> get recibidos => _recibidos.stream;

  @override
  Stream<MensajePush> get abiertos => _abiertos.stream;

  @override
  Future<MensajePush?> mensajeInicial() async => inicial;

  /// Simula que FCM renovó el token.
  void renovarToken(String token) {
    tokenPush = token;
    _tokens.add(token);
  }

  /// Simula un aviso que llega con la app abierta.
  void recibir(MensajePush mensaje) => _recibidos.add(mensaje);

  /// Simula un aviso tocado en la bandeja del sistema.
  void abrir(MensajePush mensaje) => _abiertos.add(mensaje);

  void cerrar() {
    _tokens.close();
    _recibidos.close();
    _abiertos.close();
  }
}
