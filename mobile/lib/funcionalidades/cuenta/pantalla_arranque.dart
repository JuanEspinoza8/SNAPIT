import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/error_api.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/tema/tema_app.dart';

/// Se ve al abrir la app mientras se revisa la sesión guardada, y si no se
/// pudo revisar (sin conexión o error del servidor).
class PantallaArranque extends ConsumerWidget {
  const PantallaArranque({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sesion = ref.watch(sesionProvider);
    final tema = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(Espacio.xl),
            child: sesion.hasError && !sesion.isLoading
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.cloud_off_outlined,
                        size: Espacio.xxxl,
                        color: tema.colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(height: Espacio.lg),
                      Text(
                        ErrorApi.desde(sesion.error!).mensaje,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: Espacio.xl),
                      FilledButton(
                        onPressed: () => ref.invalidate(sesionProvider),
                        child: const Text('Reintentar'),
                      ),
                    ],
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircularProgressIndicator(),
                      const SizedBox(height: Espacio.lg),
                      Text(
                        'Abriendo SnapIt…',
                        style: tema.textTheme.bodyMedium?.copyWith(
                          color: tema.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
