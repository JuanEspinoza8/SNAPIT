import 'package:flutter/material.dart';

/// Paleta del sistema de diseño. Las pantallas no usan estos valores
/// directamente: leen `Theme.of(context)`, así funcionan con las dos.
@immutable
class PaletaSnapIt {
  const PaletaSnapIt({
    required this.brillo,
    required this.primario,
    required this.sobrePrimario,
    required this.superficie,
    required this.superficieAlterna,
    required this.borde,
    required this.texto,
    required this.textoSecundario,
    required this.peligro,
    required this.sobrePeligro,
  });

  /// La original: fondo blanco y azul petróleo.
  static const claro = PaletaSnapIt(
    brillo: Brightness.light,
    primario: Color(0xFF1F5E7A),
    sobrePrimario: Color(0xFFFFFFFF),
    superficie: Color(0xFFFFFFFF),
    superficieAlterna: Color(0xFFF6F7F9),
    borde: Color(0xFFD9DEE5),
    texto: Color(0xFF1A202C),
    textoSecundario: Color(0xFF5A6474),
    peligro: Color(0xFFB42318),
    sobrePeligro: Color(0xFFFFFFFF),
  );

  /// «Noche neutra»: gris carbón con acento azul. El azul con texto blanco
  /// encima no llega a AA (3,7:1), así que lo que va sobre el azul es casi
  /// negro (5:1). El texto secundario sobre las tarjetas da 6,7:1.
  static const oscuro = PaletaSnapIt(
    brillo: Brightness.dark,
    primario: Color(0xFF3B82F6),
    sobrePrimario: Color(0xFF0B1220),
    superficie: Color(0xFF0F1115),
    superficieAlterna: Color(0xFF181B21),
    borde: Color(0xFF2A2F38),
    texto: Color(0xFFE6E8EB),
    textoSecundario: Color(0xFF9AA3AE),
    peligro: Color(0xFFF87171),
    sobrePeligro: Color(0xFF1A0505),
  );

  final Brightness brillo;
  final Color primario;
  final Color sobrePrimario;
  final Color superficie;

  /// Tarjetas, campos y todo lo que se apoya sobre el fondo.
  final Color superficieAlterna;
  final Color borde;
  final Color texto;
  final Color textoSecundario;
  final Color peligro;
  final Color sobrePeligro;
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

/// Colores de la gravedad de un incidente (`severidad` en la base). Todos
/// llevan [ColoresFijos.sobreEstado] encima con contraste AA. Moderada no
/// repite el color de «En revisión»: van una al lado de la otra en las
/// tarjetas. Se leen con `Theme.of(context).extension<ColoresGravedad>()!`.
@immutable
class ColoresGravedad extends ThemeExtension<ColoresGravedad> {
  const ColoresGravedad({
    required this.leve,
    required this.moderada,
    required this.grave,
  });

  static const claro = ColoresGravedad(
    leve: Color(0xFF3D5A80),
    moderada: Color(0xFFC2410C),
    grave: Color(0xFFC53030),
  );

  final Color leve;
  final Color moderada;
  final Color grave;

  @override
  ColoresGravedad copyWith({Color? leve, Color? moderada, Color? grave}) {
    return ColoresGravedad(
      leve: leve ?? this.leve,
      moderada: moderada ?? this.moderada,
      grave: grave ?? this.grave,
    );
  }

  @override
  ColoresGravedad lerp(ColoresGravedad? other, double t) {
    if (other == null) return this;
    return ColoresGravedad(
      leve: Color.lerp(leve, other.leve, t)!,
      moderada: Color.lerp(moderada, other.moderada, t)!,
      grave: Color.lerp(grave, other.grave, t)!,
    );
  }
}

/// Colores que no cambian con el tema. Mismos valores que en la web
/// (`web/src/compartido/tema/tema.css`). Se leen con
/// `Theme.of(context).extension<ColoresFijos>()!`.
@immutable
class ColoresFijos extends ThemeExtension<ColoresFijos> {
  const ColoresFijos({
    required this.sobreEstado,
    required this.velo,
    required this.sobreVelo,
    required this.marcadorBorde,
  });

  static const valores = ColoresFijos(
    sobreEstado: Color(0xFFFFFFFF),
    velo: Color(0x99000000),
    sobreVelo: Color(0xFFFFFFFF),
    marcadorBorde: Color(0xFFFFFFFF),
  );

  /// Texto e íconos sobre los estados y las gravedades: con todos da AA.
  final Color sobreEstado;

  /// Fondo de lo que va encima de una foto (cuál se ve, «+3 fotos», el
  /// autor): se lee sobre cualquier imagen.
  final Color velo;
  final Color sobreVelo;

  /// Borde de los marcadores: el mapa es claro en los dos temas.
  final Color marcadorBorde;

  @override
  ColoresFijos copyWith({
    Color? sobreEstado,
    Color? velo,
    Color? sobreVelo,
    Color? marcadorBorde,
  }) {
    return ColoresFijos(
      sobreEstado: sobreEstado ?? this.sobreEstado,
      velo: velo ?? this.velo,
      sobreVelo: sobreVelo ?? this.sobreVelo,
      marcadorBorde: marcadorBorde ?? this.marcadorBorde,
    );
  }

  @override
  ColoresFijos lerp(ColoresFijos? other, double t) {
    if (other == null) return this;
    return ColoresFijos(
      sobreEstado: Color.lerp(sobreEstado, other.sobreEstado, t)!,
      velo: Color.lerp(velo, other.velo, t)!,
      sobreVelo: Color.lerp(sobreVelo, other.sobreVelo, t)!,
      marcadorBorde: Color.lerp(marcadorBorde, other.marcadorBorde, t)!,
    );
  }
}

/// El tema de la app con la paleta [p]: [PaletaSnapIt.claro] u
/// [PaletaSnapIt.oscuro].
ThemeData crearTema([PaletaSnapIt p = PaletaSnapIt.claro]) {
  final esquema = ColorScheme(
    brightness: p.brillo,
    primary: p.primario,
    onPrimary: p.sobrePrimario,
    secondary: p.primario,
    onSecondary: p.sobrePrimario,
    error: p.peligro,
    onError: p.sobrePeligro,
    surface: p.superficie,
    onSurface: p.texto,
    onSurfaceVariant: p.textoSecundario,
    surfaceContainerLowest: p.superficie,
    surfaceContainerLow: p.superficieAlterna,
    surfaceContainer: p.superficieAlterna,
    surfaceContainerHigh: p.superficieAlterna,
    surfaceContainerHighest: p.superficieAlterna,
    outline: p.borde,
    outlineVariant: p.borde,
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
  final borde = BorderSide(color: p.borde);

  return ThemeData(
    colorScheme: esquema,
    textTheme: textos.apply(bodyColor: p.texto, displayColor: p.texto),
    scaffoldBackgroundColor: p.superficie,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    appBarTheme: AppBarTheme(
      backgroundColor: p.superficie,
      foregroundColor: p.texto,
      elevation: 0,
      scrolledUnderElevation: 0,
      shape: Border(bottom: borde),
    ),
    // La barra de abajo, del mismo tono que las tarjetas: se despega del
    // fondo sin sombra.
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.superficieAlterna,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: tamanioBoton, shape: forma),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: tamanioBoton,
        shape: forma,
        side: borde,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(minimumSize: tamanioBoton, shape: forma),
    ),
    inputDecorationTheme: InputDecorationTheme(
      floatingLabelBehavior: FloatingLabelBehavior.always,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radioBorde),
        borderSide: borde,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radioBorde),
        borderSide: borde,
      ),
    ),
    // Al revés del fondo: en el claro, oscuro; en el oscuro, claro.
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: p.texto,
      contentTextStyle: textos.bodyMedium?.copyWith(color: p.superficie),
      shape: forma,
    ),
    // Material 3 redondea la hoja a 28; el sistema de diseño usa 8.
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: p.superficieAlterna,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(radioBorde)),
      ),
    ),
    dividerTheme: DividerThemeData(color: p.borde),
    // Los estados y las gravedades llevan texto blanco en los dos temas: sus
    // colores ya están elegidos para eso.
    extensions: const [
      ColoresEstado.claro,
      ColoresGravedad.claro,
      ColoresFijos.valores,
    ],
  );
}
