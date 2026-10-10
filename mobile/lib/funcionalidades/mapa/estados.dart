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

/// El estado escrito, con su ícono y su color de fondo.
class EtiquetaEstado extends StatelessWidget {
  const EtiquetaEstado(this.estado, {super.key});

  final EstadoVisible estado;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final texto = tema.colorScheme.onPrimary;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: estado.color(context),
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
            Icon(estado.icono, size: 16, color: texto),
            const SizedBox(width: Espacio.xs),
            Text(
              estado.etiqueta,
              style: tema.textTheme.labelMedium?.copyWith(color: texto),
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
    final esquema = Theme.of(context).colorScheme;
    return Container(
      width: tamanio,
      height: tamanio,
      decoration: BoxDecoration(
        color: estado.color(context),
        shape: BoxShape.circle,
        border: Border.all(color: esquema.surface, width: 2),
        boxShadow: [_sombraMarcador(esquema)],
      ),
      child: Icon(estado.icono, size: tamanio * 0.55, color: esquema.onPrimary),
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
        border: Border.all(color: tema.colorScheme.surface, width: 3),
        boxShadow: [_sombraMarcador(tema.colorScheme)],
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
BoxShadow _sombraMarcador(ColorScheme esquema) => BoxShadow(
  color: esquema.onSurface.withValues(alpha: 0.4),
  blurRadius: 4,
  offset: const Offset(0, 1),
);
