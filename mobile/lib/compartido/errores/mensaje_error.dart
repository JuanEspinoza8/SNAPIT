import 'package:flutter/material.dart';

import '../tema/tema_app.dart';

/// Error dentro de un formulario. Queda visible hasta el próximo intento.
class MensajeError extends StatelessWidget {
  const MensajeError(this.mensaje, {super.key});

  final String mensaje;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final color = tema.colorScheme.error;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(Espacio.md),
        decoration: BoxDecoration(
          border: Border.all(color: color),
          borderRadius: BorderRadius.circular(radioBorde),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.error_outline, color: color),
            const SizedBox(width: Espacio.sm),
            Expanded(
              child: Text(
                mensaje,
                style: tema.textTheme.bodyMedium?.copyWith(color: color),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
