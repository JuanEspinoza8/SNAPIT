import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/rutas/rutas_app.dart';
import 'package:snapit/compartido/sesion/usuario.dart';

void main() {
  const vecino = Usuario(
    id: 7,
    email: 'ana@ejemplo.com',
    nombre: 'Ana',
    rol: Rol.vecino,
  );
  const cargando = AsyncLoading<Usuario?>();
  const sinSesion = AsyncData<Usuario?>(null);
  const conSesion = AsyncData<Usuario?>(vecino);
  final conError = AsyncError<Usuario?>(Exception('sin red'), StackTrace.empty);

  test('mientras se revisa la sesión, todo va al arranque', () {
    expect(redireccion(cargando, Rutas.arranque), isNull);
    expect(redireccion(cargando, Rutas.principal), Rutas.arranque);
    expect(redireccion(cargando, Rutas.ingreso), Rutas.arranque);
  });

  test('si no se pudo revisar la sesión, se queda en el arranque', () {
    expect(redireccion(conError, Rutas.arranque), isNull);
    expect(redireccion(conError, Rutas.principal), Rutas.arranque);
  });

  test('sin sesión solo se puede estar en las pantallas de cuenta', () {
    expect(redireccion(sinSesion, Rutas.arranque), Rutas.ingreso);
    expect(redireccion(sinSesion, Rutas.principal), Rutas.ingreso);
    expect(redireccion(sinSesion, Rutas.ingreso), isNull);
    expect(redireccion(sinSesion, Rutas.registro), isNull);
    expect(redireccion(sinSesion, Rutas.recuperarClave), isNull);
  });

  test('con sesión, las pantallas de cuenta llevan a la principal', () {
    expect(redireccion(conSesion, Rutas.arranque), Rutas.principal);
    expect(redireccion(conSesion, Rutas.ingreso), Rutas.principal);
    expect(redireccion(conSesion, Rutas.registro), Rutas.principal);
    expect(redireccion(conSesion, Rutas.recuperarClave), Rutas.principal);
    expect(redireccion(conSesion, Rutas.principal), isNull);
  });
}
