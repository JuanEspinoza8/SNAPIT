import 'package:flutter_test/flutter_test.dart';
import 'package:snapit/compartido/formato/fechas.dart';

void main() {
  group('haceCuanto', () {
    final ahora = DateTime.utc(2026, 11, 4, 15);
    String hace(Duration tiempo) =>
        haceCuanto(ahora.subtract(tiempo), ahora: ahora);

    test('dice minutos, horas y días como una red social', () {
      expect(hace(const Duration(seconds: 30)), 'hace un momento');
      expect(hace(const Duration(minutes: 5)), 'hace 5 min');
      expect(hace(const Duration(hours: 1)), 'hace 1 hora');
      expect(hace(const Duration(hours: 23)), 'hace 23 horas');
      expect(hace(const Duration(hours: 30)), 'ayer');
      expect(hace(const Duration(days: 6)), 'hace 6 días');
    });

    test('pasada una semana, la fecha larga en hora de Argentina', () {
      expect(hace(const Duration(days: 8)), '27 de octubre de 2026');
    });
  });
}
