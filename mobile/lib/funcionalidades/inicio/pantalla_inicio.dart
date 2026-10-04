import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/errores/aviso_error.dart';
import '../../compartido/tema/tema_app.dart';
import '../../config/entorno.dart';
import 'estado_servidor.dart';

/// Pantalla inicial provisoria: muestra si la app llega al servidor.
class PantallaInicio extends ConsumerWidget {
  const PantallaInicio({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(estadoServidorProvider, (_, estado) {
      if (!estado.isLoading && estado.hasError) {
        mostrarError(context, estado.error!);
      }
    });

    final estado = ref.watch(estadoServidorProvider);
    final tema = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('SnapIt')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Espacio.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Estado del servidor', style: tema.textTheme.titleMedium),
              const SizedBox(height: Espacio.xs),
              Text(
                Entorno.apiUrl,
                style: tema.textTheme.bodySmall?.copyWith(
                  color: tema.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: Espacio.lg),
              if (estado.isLoading)
                const Text('Consultando…')
              else
                switch (estado) {
                  AsyncData(:final value) => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Servidor: conectado'),
                      const SizedBox(height: Espacio.xs),
                      Text(
                        'Base de datos: '
                        '${value.baseDeDatosOk ? 'conectada' : 'sin conexión'}',
                      ),
                    ],
                  ),
                  _ => const Text('No se pudo consultar el servidor.'),
                },
              const SizedBox(height: Espacio.xl),
              OutlinedButton(
                onPressed: estado.isLoading
                    ? null
                    : () => ref.invalidate(estadoServidorProvider),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
