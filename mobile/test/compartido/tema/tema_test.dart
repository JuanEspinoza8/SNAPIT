import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/tema/tema_app.dart';

/// Contraste de WCAG 2 entre dos colores.
double contraste(Color a, Color b) {
  final clara = math.max(a.computeLuminance(), b.computeLuminance());
  final oscura = math.min(a.computeLuminance(), b.computeLuminance());
  return (clara + 0.05) / (oscura + 0.05);
}

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

  test('«Moderada» no repite el color de «En revisión»', () {
    expect(
      ColoresGravedad.claro.moderada,
      isNot(ColoresEstado.claro.registrado),
    );
  });
}
