import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/funcionalidades/mapa/barra_consulta.dart';
import 'package:snapit/funcionalidades/mapa/consulta_interpretada.dart';
import 'package:snapit/funcionalidades/mapa/modelos.dart';

import '../../apoyo/app_de_prueba.dart';
import '../../apoyo/servidor_falso.dart';

const Map<String, Object?> _respuestaInterpretada = {
  'filtros': {
    'categoriaId': 3,
    'estado': 'VERIFICADO',
    'desde': '2026-10-01',
    'hasta': null,
    'barrio': 'Centro',
  },
  'descripcion': 'Pozos verificados en el Centro',
  'registroIaId': 42,
};

const _categoriasJson = {
  'categorias': [
    {'id': 3, 'nombre': 'Cordón sin rampa'},
  ],
};

ServidorFalso _servidorDeConsulta(
  Future<ResponseBody> Function(RequestOptions pedido) responderConsulta,
) {
  return ServidorFalso(
    (pedido) => switch (pedido.path) {
      '/auth/yo' => json(200, {'usuario': usuarioJson()}),
      '/consultas/interpretar' => responderConsulta(pedido),
      '/categorias' => json(200, _categoriasJson),
      '/barrios' => json(200, {
        'barrios': ['Centro'],
      }),
      _ => errorApi(404, 'RUTA_NO_ENCONTRADA', 'No existe'),
    },
  );
}

Future<void> _abrirBarra(
  WidgetTester tester,
  ServidorFalso servidor,
  ValueChanged<FiltrosMapa> alAplicar,
) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final contenedor = contenedorDePrueba(servidor);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: contenedor,
      child: MaterialApp(
        home: Scaffold(
          body: BarraConsulta(
            filtrosActuales: const FiltrosMapa(),
            alAplicar: alAplicar,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(guardarSesion);

  test('las fechas de la IA se leen en hora local', () {
    final consulta = ConsultaInterpretada.desdeJson(_respuestaInterpretada);

    expect(
      consulta.filtros,
      FiltrosMapa(
        categoriaId: 3,
        estado: EstadoVisible.verificado,
        desde: DateTime(2026, 10, 1),
        barrio: 'Centro',
      ),
    );
    expect(consulta.descripcion, 'Pozos verificados en el Centro');
    expect(consulta.registroIaId, 42);
  });

  test('copyWith permite limpiar un filtro sin tocar los demás', () {
    final original = FiltrosMapa(
      categoriaId: 1,
      estado: EstadoVisible.registrado,
      desde: DateTime(2026, 1, 2),
      hasta: DateTime(2026, 1, 3),
      barrio: 'Centro',
    );

    expect(
      original.copyWith(barrio: null),
      FiltrosMapa(
        categoriaId: 1,
        estado: EstadoVisible.registrado,
        desde: DateTime(2026, 1, 2),
        hasta: DateTime(2026, 1, 3),
      ),
    );
    expect(original.barrio, 'Centro');
  });

  testWidgets('interpreta la consulta y aplica los filtros revisados', (
    tester,
  ) async {
    final servidor = _servidorDeConsulta(
      (_) async => await json(200, _respuestaInterpretada),
    );
    FiltrosMapa? aplicados;
    await _abrirBarra(tester, servidor, (filtros) => aplicados = filtros);

    await tester.enterText(find.byType(TextField), '  pozos en el centro  ');
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    final pedido = servidor.pedidos.singleWhere(
      (p) => p.ruta == '/consultas/interpretar',
    );
    expect(pedido.metodo, 'POST');
    expect(pedido.datos, {'texto': 'pozos en el centro'});
    expect(find.text('Revisá los filtros'), findsOneWidget);
    expect(find.text('Pozos verificados en el Centro'), findsOneWidget);
    expect(find.text('Barrio: Centro'), findsOneWidget);

    await tester.tap(find.text('Buscar con estos filtros'));
    await tester.pumpAndSettle();

    expect(
      aplicados,
      FiltrosMapa(
        categoriaId: 3,
        estado: EstadoVisible.verificado,
        desde: DateTime(2026, 10, 1),
        barrio: 'Centro',
      ),
    );
  });

  testWidgets('si la IA no entiende, avisa y ofrece los filtros comunes', (
    tester,
  ) async {
    final servidor = _servidorDeConsulta(
      (_) async => await errorApi(
        422,
        'CONSULTA_NO_ENTENDIDA',
        'No entendimos la consulta.',
      ),
    );
    FiltrosMapa? aplicados;
    await _abrirBarra(tester, servidor, (filtros) => aplicados = filtros);

    await tester.enterText(find.byType(TextField), 'no entiendo nada');
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();

    expect(find.text('No entendimos la consulta.'), findsOneWidget);
    expect(find.text('Filtros'), findsOneWidget);

    await tester.tap(find.text('Limpiar filtros'));
    await tester.pumpAndSettle();

    expect(aplicados, const FiltrosMapa());
  });
}
