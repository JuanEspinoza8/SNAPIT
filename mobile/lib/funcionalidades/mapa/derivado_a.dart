import 'package:flutter/material.dart';

/// A qué área quedó derivado un incidente publicado (`derivadoA` en la
/// ficha y el feed). Mientras está en revisión viene null y no se muestra
/// nada: todavía no se derivó a nadie.
class DerivadoA extends StatelessWidget {
  const DerivadoA(this.area, {super.key});

  final String? area;

  @override
  Widget build(BuildContext context) {
    final area = this.area;
    if (area == null) return const SizedBox.shrink();
    final tema = Theme.of(context);
    return Text.rich(
      TextSpan(
        text: 'Derivado al área de ',
        children: [
          TextSpan(
            text: area,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: tema.colorScheme.onSurface,
            ),
          ),
        ],
      ),
      style: tema.textTheme.bodySmall?.copyWith(
        color: tema.colorScheme.onSurfaceVariant,
      ),
    );
  }
}
