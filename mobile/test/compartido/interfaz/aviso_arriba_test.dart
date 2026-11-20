import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/interfaz/aviso_arriba.dart';
import 'package:snapit/compartido/tema/tema_app.dart';

void main() {
  Future<void> mostrar(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(theme: crearTema(), home: const Scaffold()),
    );
    mostrarAvisoArriba(
      tester.element(find.byType(Scaffold)),
      titulo: 'Reporte enviado',
      texto: 'Queda pendiente de aprobación antes de publicarse.',
    );
  }

  double opacidad(WidgetTester tester) => tester
      .widget<FadeTransition>(
        find
            .ancestor(
              of: find.text('Reporte enviado'),
              matching: find.byType(FadeTransition),
            )
            .first,
      )
      .opacity
      .value;

  // Para que no quede pendiente el temporizador que lo cierra.
  Future<void> esperarQueSeVaya(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.text('Reporte enviado'), findsNothing);
  }

  testWidgets('baja desde arriba con el radio del sistema de diseño', (
    tester,
  ) async {
    await mostrar(tester);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(opacidad(tester), inExclusiveRange(0, 1));
    await tester.pumpAndSettle();
    expect(opacidad(tester), 1);
    final caja = tester.widget<Material>(
      find
          .ancestor(
            of: find.text('Reporte enviado'),
            matching: find.byType(Material),
          )
          .first,
    );
    expect(caja.borderRadius, BorderRadius.circular(radioBorde));

    await esperarQueSeVaya(tester);
  });

  testWidgets('con las animaciones apagadas aparece y se va sin moverse', (
    tester,
  ) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await mostrar(tester);
    await tester.pump();

    expect(opacidad(tester), 1);
    expect(tester.hasRunningAnimations, isFalse);

    await tester.tap(find.text('Reporte enviado'));
    await tester.pump();
    expect(find.text('Reporte enviado'), findsNothing);
  });
}
