import 'package:flutter/material.dart';

/// Paleta del sistema de diseño. Las pantallas no usan estos valores
/// directamente: leen `Theme.of(context)`.
abstract final class ColoresSnapIt {
  static const primario = Color(0xFF1F5E7A);
  static const sobrePrimario = Color(0xFFFFFFFF);
  static const superficie = Color(0xFFFFFFFF);
  static const superficieAlterna = Color(0xFFF6F7F9);
  static const borde = Color(0xFFD9DEE5);
  static const texto = Color(0xFF1A202C);
  static const textoSecundario = Color(0xFF5A6474);
  static const peligro = Color(0xFFB42318);
}

/// Escala de espaciado, en múltiplos de 4.
abstract final class Espacio {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 48;
}

const double radioBorde = 8;

/// Alto mínimo de botones y áreas táctiles.
const double altoTactil = 48;

/// Colores de los estados de un incidente (`estado_incidente` en la base).
/// Se leen con `Theme.of(context).extension<ColoresEstado>()!`.
@immutable
class ColoresEstado extends ThemeExtension<ColoresEstado> {
  const ColoresEstado({
    required this.registrado,
    required this.verificado,
    required this.derivado,
    required this.enEjecucion,
    required this.resuelto,
    required this.desestimado,
  });

  static const claro = ColoresEstado(
    registrado: Color(0xFF975A16),
    verificado: Color(0xFF2B6CB0),
    derivado: Color(0xFFB83280),
    enEjecucion: Color(0xFF6B46C1),
    resuelto: Color(0xFF276749),
    desestimado: Color(0xFF4A5568),
  );

  final Color registrado;
  final Color verificado;
  final Color derivado;
  final Color enEjecucion;
  final Color resuelto;
  final Color desestimado;

  @override
  ColoresEstado copyWith({
    Color? registrado,
    Color? verificado,
    Color? derivado,
    Color? enEjecucion,
    Color? resuelto,
    Color? desestimado,
  }) {
    return ColoresEstado(
      registrado: registrado ?? this.registrado,
      verificado: verificado ?? this.verificado,
      derivado: derivado ?? this.derivado,
      enEjecucion: enEjecucion ?? this.enEjecucion,
      resuelto: resuelto ?? this.resuelto,
      desestimado: desestimado ?? this.desestimado,
    );
  }

  @override
  ColoresEstado lerp(ColoresEstado? other, double t) {
    if (other == null) return this;
    return ColoresEstado(
      registrado: Color.lerp(registrado, other.registrado, t)!,
      verificado: Color.lerp(verificado, other.verificado, t)!,
      derivado: Color.lerp(derivado, other.derivado, t)!,
      enEjecucion: Color.lerp(enEjecucion, other.enEjecucion, t)!,
      resuelto: Color.lerp(resuelto, other.resuelto, t)!,
      desestimado: Color.lerp(desestimado, other.desestimado, t)!,
    );
  }
}

ThemeData crearTema() {
  const esquema = ColorScheme(
    brightness: Brightness.light,
    primary: ColoresSnapIt.primario,
    onPrimary: ColoresSnapIt.sobrePrimario,
    secondary: ColoresSnapIt.primario,
    onSecondary: ColoresSnapIt.sobrePrimario,
    error: ColoresSnapIt.peligro,
    onError: ColoresSnapIt.sobrePrimario,
    surface: ColoresSnapIt.superficie,
    onSurface: ColoresSnapIt.texto,
    onSurfaceVariant: ColoresSnapIt.textoSecundario,
    surfaceContainerLowest: ColoresSnapIt.superficie,
    surfaceContainerLow: ColoresSnapIt.superficieAlterna,
    surfaceContainer: ColoresSnapIt.superficieAlterna,
    surfaceContainerHigh: ColoresSnapIt.superficieAlterna,
    surfaceContainerHighest: ColoresSnapIt.superficieAlterna,
    outline: ColoresSnapIt.borde,
    outlineVariant: ColoresSnapIt.borde,
    surfaceTint: Colors.transparent,
  );

  // Escala 12 / 14 / 16 / 20 / 24 / 32 y dos pesos. El texto base es de 16.
  const textos = TextTheme(
    headlineLarge: TextStyle(fontSize: 32, fontWeight: FontWeight.w600),
    headlineMedium: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
    titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
    titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
    bodyLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w400),
    bodyMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w400),
    bodySmall: TextStyle(fontSize: 14, fontWeight: FontWeight.w400),
    labelLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
    labelMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
    labelSmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w400),
  );

  final forma = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(radioBorde),
  );
  const tamanioBoton = Size(altoTactil, altoTactil);

  return ThemeData(
    colorScheme: esquema,
    textTheme: textos.apply(
      bodyColor: ColoresSnapIt.texto,
      displayColor: ColoresSnapIt.texto,
    ),
    scaffoldBackgroundColor: ColoresSnapIt.superficie,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    appBarTheme: const AppBarTheme(
      backgroundColor: ColoresSnapIt.superficie,
      foregroundColor: ColoresSnapIt.texto,
      elevation: 0,
      scrolledUnderElevation: 0,
      shape: Border(bottom: BorderSide(color: ColoresSnapIt.borde)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: tamanioBoton, shape: forma),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: tamanioBoton,
        shape: forma,
        side: const BorderSide(color: ColoresSnapIt.borde),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(minimumSize: tamanioBoton, shape: forma),
    ),
    inputDecorationTheme: InputDecorationTheme(
      floatingLabelBehavior: FloatingLabelBehavior.always,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radioBorde),
        borderSide: const BorderSide(color: ColoresSnapIt.borde),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radioBorde),
        borderSide: const BorderSide(color: ColoresSnapIt.borde),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: ColoresSnapIt.texto,
      contentTextStyle: textos.bodyMedium?.copyWith(
        color: ColoresSnapIt.sobrePrimario,
      ),
      shape: forma,
    ),
    dividerTheme: const DividerThemeData(color: ColoresSnapIt.borde),
    extensions: const [ColoresEstado.claro],
  );
}
