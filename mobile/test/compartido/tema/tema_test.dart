import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/app.dart';
import 'package:snapit/compartido/tema/modo_tema.dart';
import 'package:snapit/compartido/tema/tema_app.dart';

import '../../apoyo/contraste.dart';

void main() {
  for (final (nombre, p) in [
    ('claro', PaletaSnapIt.claro),
    ('oscuro', PaletaSnapIt.oscuro),
  ]) {
    group('contraste AA del tema $nombre', () {
      final pares = {
        'texto sobre el fondo': (p.texto, p.superficie),
        'texto sobre las tarjetas': (p.texto, p.superficieAlterna),
        'secundario sobre el fondo': (p.textoSecundario, p.superficie),
        'secundario sobre las tarjetas': (
          p.textoSecundario,
          p.superficieAlterna,
        ),
        'primario sobre el fondo': (p.primario, p.superficie),
        'primario sobre las tarjetas': (p.primario, p.superficieAlterna),
        'peligro sobre el fondo': (p.peligro, p.superficie),
        'lo que va sobre el primario': (p.sobrePrimario, p.primario),
        'lo que va sobre el peligro': (p.sobrePeligro, p.peligro),
      };
      for (final MapEntry(key: caso, value: (texto, fondo)) in pares.entries) {
        test('$caso da 4,5:1 o más', () {
          expect(contraste(texto, fondo), greaterThanOrEqualTo(4.5));
        });
      }
    });
  }

  test('el texto sobre cada estado y cada gravedad da 4,5:1 o más', () {
    const estados = ColoresEstado.claro;
    const gravedades = ColoresGravedad.claro;
    for (final fondo in [
      estados.registrado,
      estados.verificado,
      estados.derivado,
      estados.enEjecucion,
      estados.resuelto,
      estados.desestimado,
      gravedades.leve,
      gravedades.moderada,
      gravedades.grave,
    ]) {
      expect(
        contraste(ColoresFijos.valores.sobreEstado, fondo),
        greaterThanOrEqualTo(4.5),
      );
    }
  });

  group('lo que va sobre el mapa, que es claro en los dos temas', () {
    const fijos = ColoresFijos.valores;
    // El blanco y el crema de las manzanas de OpenStreetMap.
    for (final (nombre, fondo) in [
      ('el blanco', Color(0xFFFFFFFF)),
      ('el fondo del mapa', Color(0xFFF2EFE9)),
    ]) {
      test('el trazo da 3:1 o más sobre $nombre (gráficos)', () {
        expect(contraste(fijos.marcadorTrazo, fondo), greaterThanOrEqualTo(3));
      });
    }

    test('el número de un grupo da 4,5:1 o más sobre su círculo', () {
      expect(
        contraste(fijos.marcadorBorde, fijos.marcadorTrazo),
        greaterThanOrEqualTo(4.5),
      );
    });
  });

  test('«Moderada» no repite el color de «En revisión»', () {
    expect(
      ColoresGravedad.claro.moderada,
      isNot(ColoresEstado.claro.registrado),
    );
  });

  group('tema guardado', () {
    test('se lee claro solo si se eligió el claro', () async {
      FlutterSecureStorage.setMockInitialValues({'modoTema': 'claro'});
      expect(await ModoTemaNotifier.leerGuardado(), ThemeMode.light);

      FlutterSecureStorage.setMockInitialValues({});
      expect(await ModoTemaNotifier.leerGuardado(), ThemeMode.dark);
    });

    testWidgets('leído antes de abrir, la primera pantalla ya sale en ese '
        'tema, sin pasar por el oscuro', (tester) async {
      FlutterSecureStorage.setMockInitialValues({});
      final contenedor = ProviderContainer(
        retry: (_, _) => null,
        overrides: [
          modoTemaGuardadoProvider.overrideWithValue(ThemeMode.light),
        ],
      );
      addTearDown(contenedor.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: contenedor,
          child: const AppSnapIt(),
        ),
      );

      // Un solo cuadro: si arrancara oscuro, se vería acá.
      final tema = Theme.of(tester.element(find.byType(Navigator).first));
      expect(tema.brightness, Brightness.light);
    });
  });
}
