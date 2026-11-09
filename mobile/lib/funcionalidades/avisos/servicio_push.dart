import 'dart:async';
import 'dart:developer' as developer;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'modelos.dart';

/// El estado del permiso para mostrar notificaciones del sistema.
enum EstadoPermiso { autorizado, denegado, noDeterminado, desconocido }

/// Inicializa Firebase. Sin `google-services.json` falla y la app sigue
/// funcionando: los avisos quedan guardados, pero no llegan al celular.
///
/// La llama `main` antes de dibujar. En los tests no se llama: el servicio se
/// reemplaza por uno falso.
Future<void> iniciarFirebasePush() async {
  try {
    if (Firebase.apps.isEmpty) await Firebase.initializeApp();
    _firebaseListo = true;
  } catch (error, pila) {
    developer.log(
      'Firebase no está configurado: los avisos push quedan apagados. '
      'Falta android/app/google-services.json (ver README).',
      name: 'avisos',
      error: error,
      stackTrace: pila,
    );
  }
}

var _firebaseListo = false;

final servicioPushProvider = Provider<ServicioPush>((ref) {
  final servicio = ServicioPushFirebase();
  ref.onDispose(servicio.cerrar);
  return servicio;
});

/// La puerta de la app a FCM. En los tests se reemplaza por uno falso para no
/// depender de los canales nativos.
abstract interface class ServicioPush {
  Future<EstadoPermiso> estadoPermiso();

  /// Pide el permiso del sistema (Android 13 o superior). Devuelve si quedó
  /// autorizado.
  Future<bool> pedirPermiso();

  Future<String?> token();

  /// Los tokens nuevos cuando FCM renueva el del celular.
  Stream<String> get tokensRenovados;

  /// Los avisos que llegan con la app abierta.
  Stream<MensajePush> get recibidos;

  /// Los avisos que el usuario toca (con la app en segundo plano o cerrada).
  Stream<MensajePush> get abiertos;

  /// El aviso que abrió la app desde cero, si lo hubo.
  Future<MensajePush?> mensajeInicial();
}

class ServicioPushFirebase implements ServicioPush {
  ServicioPushFirebase() {
    if (!_firebaseListo) return;
    // El servidor sigue usando el token de FCM (`getToken`/`onTokenRefresh`),
    // no el id de instalación (FID) que entrega la API nueva `onRegistered`.
    // ignore: deprecated_member_use
    final refrescos = FirebaseMessaging.instance.onTokenRefresh;
    _suscripciones.add(refrescos.listen(_tokensRenovados.add));
    _suscripciones.add(
      FirebaseMessaging.onMessage.listen(
        (mensaje) => _recibidos.add(_desde(mensaje)),
      ),
    );
    _suscripciones.add(
      FirebaseMessaging.onMessageOpenedApp.listen(
        (mensaje) => _abiertos.add(_desde(mensaje)),
      ),
    );
  }

  final _tokensRenovados = StreamController<String>.broadcast();
  final _recibidos = StreamController<MensajePush>.broadcast();
  final _abiertos = StreamController<MensajePush>.broadcast();
  final _suscripciones = <StreamSubscription<Object?>>[];

  @override
  Stream<String> get tokensRenovados => _tokensRenovados.stream;

  @override
  Stream<MensajePush> get recibidos => _recibidos.stream;

  @override
  Stream<MensajePush> get abiertos => _abiertos.stream;

  @override
  Future<EstadoPermiso> estadoPermiso() async {
    if (!_firebaseListo) return EstadoPermiso.autorizado;
    final ajustes = await FirebaseMessaging.instance.getNotificationSettings();
    return switch (ajustes.authorizationStatus) {
      AuthorizationStatus.authorized ||
      AuthorizationStatus.provisional => EstadoPermiso.autorizado,
      AuthorizationStatus.denied ||
      AuthorizationStatus.deniedPermanently => EstadoPermiso.denegado,
      AuthorizationStatus.notDetermined => EstadoPermiso.noDeterminado,
    };
  }

  @override
  Future<bool> pedirPermiso() async {
    if (!_firebaseListo) return false;
    final ajustes = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    return ajustes.authorizationStatus == AuthorizationStatus.authorized ||
        ajustes.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> token() async {
    if (!_firebaseListo) return null;
    // Ver el comentario del constructor: el servidor espera el token de FCM.
    // ignore: deprecated_member_use
    return FirebaseMessaging.instance.getToken();
  }

  @override
  Future<MensajePush?> mensajeInicial() async {
    if (!_firebaseListo) return null;
    final mensaje = await FirebaseMessaging.instance.getInitialMessage();
    return mensaje == null ? null : _desde(mensaje);
  }

  MensajePush _desde(RemoteMessage mensaje) => MensajePush.desdeDatos(
    mensaje.data,
    titulo: mensaje.notification?.title,
    cuerpo: mensaje.notification?.body,
  );

  void cerrar() {
    for (final suscripcion in _suscripciones) {
      suscripcion.cancel();
    }
    _tokensRenovados.close();
    _recibidos.close();
    _abiertos.close();
  }
}
