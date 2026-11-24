import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/rutas/rutas_app.dart';
import 'package:snapit/funcionalidades/feed/pantalla_reporte.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

void main() {
  setUp(guardarSesion);

  testWidgets('un link a una publicación que quitó un administrador lo dice, '
      'con el motivo, sin ofrecer reintentar', (tester) async {
    const mensaje =
        'Esta publicación fue eliminada por un administrador. Motivo: Se ve '
        'una patente';
    final servidor = ServidorFalso(
      (pedido) => switch (pedido.path) {
        '/social/reportes/31' => errorApi(410, 'REPORTE_QUITADO', mensaje),
        '/incidentes' => json(200, {'incidentes': <Object>[]}),
        '/social/feed' => json(200, {
          'reportes': <Object>[],
          'siguiente': null,
        }),
        _ => json(200, {'usuario': usuarioJson()}),
      },
    );
    final contenedor = await abrirApp(tester, servidor);

    contenedor.read(rutasProvider).push(Rutas.reporte(31));
    await tester.pumpAndSettle();

    expect(find.byType(PantallaReporte), findsOneWidget);
    expect(
      find.text('Publicación eliminada por un administrador'),
      findsOneWidget,
    );
    expect(find.text(mensaje), findsOneWidget);
    expect(find.text('Reintentar'), findsNothing);
  });
}
