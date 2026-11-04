import 'package:flutter/material.dart';

import '../../compartido/tema/tema_app.dart';
import 'modelos.dart';

/// Cada estado tiene texto e ícono además del color: el color solo no alcanza
/// para quien no distingue colores, ni con el celular al sol, ni para
/// TalkBack. Los textos son los mismos que en la web.
extension PresentacionEstado on EstadoVisible {
  String get etiqueta => switch (this) {
    EstadoVisible.registrado => 'En revisión',
    EstadoVisible.verificado => 'Verificado',
    EstadoVisible.derivado => 'Derivado al área',
    EstadoVisible.enEjecucion => 'En ejecución',
    EstadoVisible.resuelto => 'Resuelto',
  };

  IconData get icono => switch (this) {
    EstadoVisible.registrado => Icons.hourglass_empty,
    EstadoVisible.verificado => Icons.check,
    EstadoVisible.derivado => Icons.arrow_forward,
    EstadoVisible.enEjecucion => Icons.construction,
    EstadoVisible.resuelto => Icons.done_all,
  };

  Color color(BuildContext context) {
    final colores = Theme.of(context).extension<ColoresEstado>()!;
    return switch (this) {
      EstadoVisible.registrado => colores.registrado,
      EstadoVisible.verificado => colores.verificado,
      EstadoVisible.derivado => colores.derivado,
      EstadoVisible.enEjecucion => colores.enEjecucion,
      EstadoVisible.resuelto => colores.resuelto,
    };
  }
}

/// Como los estados: la gravedad se lee por el texto y las barras del ícono,
/// no solo por el color.
extension PresentacionGravedad on Gravedad {
  String get etiqueta => switch (this) {
    Gravedad.leve => 'Leve',
    Gravedad.moderada => 'Moderada',
    Gravedad.grave => 'Grave',
  };

  IconData get icono => switch (this) {
    Gravedad.leve => Icons.signal_cellular_alt_1_bar,
    Gravedad.moderada => Icons.signal_cellular_alt_2_bar,
    Gravedad.grave => Icons.signal_cellular_alt,
  };

  Color color(BuildContext context) {
    final colores = Theme.of(context).extension<ColoresGravedad>()!;
    return switch (this) {
      Gravedad.leve => colores.leve,
      Gravedad.moderada => colores.moderada,
      Gravedad.grave => colores.grave,
    };
  }
}

/// La gravedad escrita, con su ícono y su color de fondo.
class EtiquetaGravedad extends StatelessWidget {
  const EtiquetaGravedad(this.gravedad, {super.key});

  final Gravedad gravedad;

  @override
  Widget build(BuildContext context) => Etiqueta(
    texto: gravedad.etiqueta,
    icono: gravedad.icono,
    color: gravedad.color(context),
  );
}

/// El estado escrito, con su ícono y su color de fondo.
class EtiquetaEstado extends StatelessWidget {
  const EtiquetaEstado(this.estado, {super.key});

  final EstadoVisible estado;

  @override
  Widget build(BuildContext context) => Etiqueta(
    texto: estado.etiqueta,
    icono: estado.icono,
    color: estado.color(context),
  );
}

/// El dibujo de [EtiquetaEstado], para estados que el mapa no muestra (mis
/// reportes también tiene «Desestimado»).
class Etiqueta extends StatelessWidget {
  const Etiqueta({
    super.key,
    required this.texto,
    required this.icono,
    required this.color,
  });

  final String texto;
  final IconData icono;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    // Igual en los dos temas: los colores de estado y gravedad están elegidos
    // para llevarlo con contraste AA.
    final colorTexto = tema.extension<ColoresFijos>()!.sobreEstado;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: Espacio.sm,
          vertical: Espacio.xs,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icono, size: 16, color: colorTexto),
            const SizedBox(width: Espacio.xs),
            Text(
              texto,
              style: tema.textTheme.labelMedium?.copyWith(color: colorTexto),
            ),
          ],
        ),
      ),
    );
  }
}

/// El círculo de un incidente en el mapa: color e ícono de su estado.
class MarcaEstado extends StatelessWidget {
  const MarcaEstado(this.estado, {super.key, this.tamanio = 32});

  final EstadoVisible estado;
  final double tamanio;

  @override
  Widget build(BuildContext context) {
    final fijos = Theme.of(context).extension<ColoresFijos>()!;
    return Container(
      width: tamanio,
      height: tamanio,
      decoration: BoxDecoration(
        color: estado.color(context),
        shape: BoxShape.circle,
        // El mapa es claro en los dos temas: el borde no sigue al tema.
        border: Border.all(color: fijos.marcadorBorde, width: 2),
        boxShadow: [_sombraMarcador(fijos)],
      ),
      child: Icon(estado.icono, size: tamanio * 0.55, color: fijos.sobreEstado),
    );
  }
}

/// El círculo de varios incidentes juntos, con la cantidad.
class MarcaGrupo extends StatelessWidget {
  const MarcaGrupo(this.cantidad, {super.key});

  final int cantidad;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final fijos = tema.extension<ColoresFijos>()!;
    final tamanio = cantidad < 10
        ? 34.0
        : cantidad < 100
        ? 42.0
        : 50.0;
    return Container(
      width: tamanio,
      height: tamanio,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: tema.colorScheme.primary,
        shape: BoxShape.circle,
        border: Border.all(color: fijos.marcadorBorde, width: 3),
        boxShadow: [_sombraMarcador(fijos)],
      ),
      child: Text(
        '$cantidad',
        style: tema.textTheme.labelMedium?.copyWith(
          color: tema.colorScheme.onPrimary,
        ),
      ),
    );
  }
}

// Una sombra corta, para que el marcador se despegue de las calles del fondo.
BoxShadow _sombraMarcador(ColoresFijos fijos) =>
    BoxShadow(color: fijos.velo, blurRadius: 4, offset: const Offset(0, 1));
