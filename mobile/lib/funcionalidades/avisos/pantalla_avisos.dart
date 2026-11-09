import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/errores/aviso_error.dart';
import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/tema/tema_app.dart';
import '../mapa/repositorio_mapa.dart';
import 'avisos.dart';
import 'modelos.dart';

/// Los avisos del usuario, con los leídos y los que todavía no. Tocar uno lo
/// marca como leído y, si es de un incidente, abre su ficha.
class PantallaAvisos extends ConsumerWidget {
  const PantallaAvisos({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final avisos = ref.watch(avisosProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Avisos')),
      body: SafeArea(
        child: switch (avisos) {
          AsyncData(:final value) => RefreshIndicator(
            onRefresh: () => ref.read(avisosProvider.notifier).recargar(),
            child: value.isEmpty ? const _SinAvisos() : _Lista(value),
          ),
          AsyncError(:final error) when !avisos.isLoading => _Error(
            error,
            alReintentar: () => ref.invalidate(avisosProvider),
          ),
          _ => const Center(
            child: CircularProgressIndicator(
              semanticsLabel: 'Cargando los avisos',
            ),
          ),
        },
      ),
    );
  }
}

class _Lista extends StatelessWidget {
  const _Lista(this.avisos);

  final List<Aviso> avisos;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      // Con pocos avisos no hay scroll, y sin esto no se podría deslizar para
      // recargar.
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(vertical: Espacio.sm),
      itemCount: avisos.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (_, i) => _FilaAviso(avisos[i]),
    );
  }
}

class _FilaAviso extends ConsumerWidget {
  const _FilaAviso(this.aviso);

  final Aviso aviso;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    final secundario = tema.colorScheme.onSurfaceVariant;
    final noLeido = !aviso.leida;

    return MergeSemantics(
      child: InkWell(
        onTap: () => _abrir(context, ref),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: Espacio.lg,
            vertical: Espacio.md,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _IconoAviso(tipo: aviso.tipo, noLeido: noLeido),
              const SizedBox(width: Espacio.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      aviso.titulo,
                      // Sin leer, el peso del título; leído, el del texto.
                      style: tema.textTheme.titleMedium?.copyWith(
                        fontWeight: noLeido ? null : FontWeight.w400,
                        color: noLeido ? null : secundario,
                      ),
                    ),
                    const SizedBox(height: Espacio.xs),
                    Text(
                      aviso.cuerpo,
                      style: tema.textTheme.bodyMedium?.copyWith(
                        color: noLeido ? null : secundario,
                      ),
                    ),
                    const SizedBox(height: Espacio.sm),
                    Text(
                      haceCuanto(aviso.creadoEn),
                      style: tema.textTheme.bodySmall?.copyWith(
                        color: secundario,
                      ),
                    ),
                  ],
                ),
              ),
              if (aviso.incidenteId != null)
                Icon(Icons.chevron_right, color: secundario),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _abrir(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(avisosProvider.notifier).marcarLeida(aviso);
    } catch (error) {
      if (context.mounted) mostrarError(context, error);
    }
    if (aviso.incidenteId case final id?) {
      if (!context.mounted) return;
      // La ficha puede haber quedado guardada de antes: el aviso es de un
      // cambio, así que se pide de nuevo.
      ref.invalidate(fichaProvider(id));
      context.push(Rutas.incidente(id));
    }
  }
}

class _IconoAviso extends StatelessWidget {
  const _IconoAviso({required this.tipo, required this.noLeido});

  final TipoAviso tipo;
  final bool noLeido;

  static const _lado = 44.0;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return SizedBox.square(
      dimension: _lado,
      child: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: tema.colorScheme.surfaceContainerLow,
                shape: BoxShape.circle,
              ),
              child: Icon(
                _icono(tipo),
                color: noLeido
                    ? tema.colorScheme.primary
                    : tema.colorScheme.onSurfaceVariant,
                semanticLabel: noLeido ? 'Aviso sin leer' : 'Aviso leído',
              ),
            ),
          ),
          if (noLeido)
            Positioned(
              top: 0,
              right: 0,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: tema.colorScheme.primary,
                  shape: BoxShape.circle,
                  border: Border.all(color: tema.colorScheme.surface, width: 2),
                ),
                child: const SizedBox.square(dimension: 12),
              ),
            ),
        ],
      ),
    );
  }

  IconData _icono(TipoAviso tipo) => switch (tipo) {
    TipoAviso.cambioEstado => Icons.sync_alt,
    TipoAviso.nuevoEnZona => Icons.add_location_alt_outlined,
    TipoAviso.cierre => Icons.task_alt,
    TipoAviso.verificacion => Icons.verified_outlined,
    TipoAviso.otro => Icons.notifications_outlined,
  };
}

class _SinAvisos extends StatelessWidget {
  const _SinAvisos();

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return LayoutBuilder(
      builder: (_, medidas) => SingleChildScrollView(
        // Para poder deslizar y recargar aunque no haya nada que scrollear.
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: medidas.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(Espacio.xl),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.notifications_none,
                    size: Espacio.xxxl,
                    color: tema.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(height: Espacio.lg),
                  Text(
                    'No tenés avisos',
                    textAlign: TextAlign.center,
                    style: tema.textTheme.titleMedium,
                  ),
                  const SizedBox(height: Espacio.xs),
                  Text(
                    'Cuando avance un reporte o aparezca un incidente cerca '
                    'tuyo, lo vas a ver acá.',
                    textAlign: TextAlign.center,
                    style: tema.textTheme.bodyMedium?.copyWith(
                      color: tema.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Error extends StatelessWidget {
  const _Error(this.error, {required this.alReintentar});

  final Object error;
  final VoidCallback alReintentar;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(Espacio.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MensajeError(ErrorApi.desde(error).mensaje),
          const SizedBox(height: Espacio.lg),
          OutlinedButton(
            onPressed: alReintentar,
            child: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}
