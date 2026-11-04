import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/tema/tema_app.dart';
import 'estado_feed.dart';
import 'tarjeta_feed.dart';

/// La pantalla de inicio: los incidentes de la ciudad uno debajo del otro,
/// del más nuevo al más viejo. Al llegar al final pide la página siguiente.
class PantallaFeed extends ConsumerWidget {
  const PantallaFeed({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(feedProvider);
    final notifier = ref.read(feedProvider.notifier);

    // Mientras recarga se sigue viendo lo que había.
    if (feed.value case final estado?) {
      if (estado.tarjetas.isEmpty) {
        return RefreshIndicator(
          onRefresh: notifier.recargar,
          child: const _Vacio(),
        );
      }
      return RefreshIndicator(
        onRefresh: notifier.recargar,
        child: ListView.builder(
          padding: const EdgeInsets.symmetric(vertical: Espacio.sm),
          // Una fila más al final: carga la página siguiente o avisa que no
          // hay más.
          itemCount: estado.tarjetas.length + 1,
          itemBuilder: (context, i) {
            if (i < estado.tarjetas.length) {
              final tarjeta = estado.tarjetas[i];
              return TarjetaIncidente(
                tarjeta,
                alAbrir: () => context.push(Rutas.incidente(tarjeta.id)),
              );
            }
            return _Final(estado: estado, alCargarMas: notifier.cargarMas);
          },
        ),
      );
    }
    if (feed case AsyncError(:final error) when !feed.isLoading) {
      return Padding(
        padding: const EdgeInsets.all(Espacio.lg),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            MensajeError(ErrorApi.desde(error).mensaje),
            const SizedBox(height: Espacio.lg),
            OutlinedButton(
              onPressed: () => ref.invalidate(feedProvider),
              child: const Text('Reintentar'),
            ),
          ],
        ),
      );
    }
    return const Center(
      child: CircularProgressIndicator(semanticsLabel: 'Cargando el inicio'),
    );
  }
}

/// La última fila. Se arma cuando el scroll se acerca al final: ahí pide la
/// página siguiente.
class _Final extends StatefulWidget {
  const _Final({required this.estado, required this.alCargarMas});

  final EstadoFeed estado;
  final Future<void> Function() alCargarMas;

  @override
  State<_Final> createState() => _FinalState();
}

class _FinalState extends State<_Final> {
  @override
  void initState() {
    super.initState();
    _pedirSiHaceFalta();
  }

  @override
  void didUpdateWidget(_Final anterior) {
    super.didUpdateWidget(anterior);
    _pedirSiHaceFalta();
  }

  // Después del cuadro: no se cambia el estado en medio de un build.
  void _pedirSiHaceFalta() {
    final estado = widget.estado;
    if (estado.hayMas && !estado.cargandoMas && estado.errorMas == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) widget.alCargarMas();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final estado = widget.estado;
    return Padding(
      padding: const EdgeInsets.all(Espacio.xl),
      child: switch (estado) {
        EstadoFeed(:final errorMas?) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            MensajeError(errorMas.mensaje),
            const SizedBox(height: Espacio.md),
            OutlinedButton(
              onPressed: widget.alCargarMas,
              child: const Text('Reintentar'),
            ),
          ],
        ),
        EstadoFeed(hayMas: true) => const Center(
          child: CircularProgressIndicator(semanticsLabel: 'Cargando más'),
        ),
        _ => Text(
          'No hay más incidentes por ahora',
          textAlign: TextAlign.center,
          style: tema.textTheme.bodySmall?.copyWith(
            color: tema.colorScheme.onSurfaceVariant,
          ),
        ),
      },
    );
  }
}

class _Vacio extends StatelessWidget {
  const _Vacio();

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    // Con scroll, para que se pueda tirar hacia abajo y recargar.
    return ListView(
      padding: const EdgeInsets.all(Espacio.xl),
      children: [
        const SizedBox(height: Espacio.xxxl),
        Icon(
          Icons.photo_library_outlined,
          size: 48,
          color: tema.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(height: Espacio.lg),
        Text(
          'Todavía no hay incidentes',
          textAlign: TextAlign.center,
          style: tema.textTheme.titleMedium,
        ),
        const SizedBox(height: Espacio.sm),
        Text(
          'Cuando un vecino reporte un problema, va a aparecer acá.',
          textAlign: TextAlign.center,
          style: tema.textTheme.bodySmall?.copyWith(
            color: tema.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}
