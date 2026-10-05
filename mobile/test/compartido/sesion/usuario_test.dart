import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/sesion/usuario.dart';

import '../../apoyo/app_de_prueba.dart';

void main() {
  test('lee el usuario de la API con su rol', () {
    final usuario = Usuario.desdeJson(usuarioJson(rol: 'ADMINISTRADOR'));

    expect(usuario.id, 7);
    expect(usuario.email, 'ana@ejemplo.com');
    expect(usuario.nombre, 'Ana');
    expect(usuario.rol, Rol.administrador);
  });

  test('un rol desconocido es un error', () {
    expect(
      () => Usuario.desdeJson(usuarioJson(rol: 'VISITANTE')),
      throwsFormatException,
    );
  });
}
