import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/cuenta/validaciones.dart';

void main() {
  group('correo', () {
    test('es obligatorio, también si solo tiene espacios', () {
      expect(validarCorreo(null), 'Es obligatorio');
      expect(validarCorreo('   '), 'Es obligatorio');
    });

    test('tiene que tener formato de correo', () {
      expect(validarCorreo('ana'), 'No es un correo válido');
      expect(validarCorreo('ana@ejemplo'), 'No es un correo válido');
      expect(validarCorreo('ana @ejemplo.com'), 'No es un correo válido');
      expect(validarCorreo('  ana@ejemplo.com  '), isNull);
    });

    test('hasta 150 caracteres', () {
      final local = 'a' * (150 - '@ejemplo.com'.length);
      expect(validarCorreo('$local@ejemplo.com'), isNull);
      expect(
        validarCorreo('a$local@ejemplo.com'),
        'Tiene que tener hasta 150 caracteres',
      );
    });
  });

  group('nombre', () {
    test('es obligatorio, también si solo tiene espacios', () {
      expect(validarNombre(''), 'Es obligatorio');
      expect(validarNombre('  '), 'Es obligatorio');
    });

    test('hasta 120 caracteres sin contar los espacios de los bordes', () {
      expect(validarNombre(' ${'a' * 120} '), isNull);
      expect(validarNombre('a' * 121), 'Tiene que tener hasta 120 caracteres');
    });
  });

  group('clave nueva', () {
    test('al menos 8 caracteres', () {
      expect(validarClaveNueva(''), 'Es obligatoria');
      expect(
        validarClaveNueva('a' * 7),
        'Tiene que tener al menos 8 caracteres',
      );
      expect(validarClaveNueva('a' * 8), isNull);
    });

    test('hasta 72 bytes', () {
      const error =
          'Tiene que tener hasta 72 caracteres (menos si usa tildes o ñ)';
      expect(validarClaveNueva('a' * 72), isNull);
      expect(validarClaveNueva('a' * 73), error);
      // Cada ñ ocupa dos bytes: 36 entran justo, 37 no.
      expect(validarClaveNueva('ñ' * 36), isNull);
      expect(validarClaveNueva('ñ' * 37), error);
    });
  });

  test('en el ingreso la clave solo es obligatoria', () {
    expect(validarClaveIngresada(''), 'Es obligatoria');
    expect(validarClaveIngresada('corta'), isNull);
  });
}
