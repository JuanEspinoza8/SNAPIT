import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/errores/aviso_error.dart';
import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/tema/tema_app.dart';
import '../feed/estado_feed.dart';
import '../mapa/estados.dart';
import '../mapa/ficha_incidente.dart';
import '../mapa/modelos.dart';
import 'modelos.dart';
import 'repositorio_mis_reportes.dart';

/// Los reportes del vecino con el estado de cada uno. Tocar uno publicado abre
/// su publicación, con el agradecimiento de SnapIt y los comentarios a su
/// foto; uno que todavía no se publicó, la ficha de su incidente, la misma
/// del mapa. Cada uno se puede eliminar (#152).
class PantallaMisReportes extends ConsumerWidget {
  const PantallaMisReportes({super.key, required this.alReportar});

  /// Lleva a la pestaña «Reportar», desde el mensaje de la lista vacía.
  final VoidCallback alReportar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportes = ref.watch(misReportesProvider);
    // Mientras recarga, y si la recarga falla, se sigue viendo la lista que
    // ya estaba.
    if (reportes.value case final lista?) {
      return RefreshIndicator(
        onRefresh: () => _recargar(context, ref),
        child: lista.isEmpty ? _SinReportes(alReportar) : _Lista(lista),
      );
    }
    if (reportes.hasError && !reportes.isLoading) {
      return _Error(
        reportes.error!,
        alReintentar: () => ref.invalidate(misReportesProvider),
      );
    }
    return const _Esqueleto();
  }

  Future<void> _recargar(BuildContext context, WidgetRef ref) async {
    ref.invalidate(misReportesProvider);
    try {
      await ref.read(misReportesProvider.future);
    } catch (e) {
      if (context.mounted) mostrarError(context, e);
    }
  }
}

class _Lista extends StatelessWidget {
  const _Lista(this.reportes);

  final List<ReporteMio> reportes;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      // Con pocos reportes no hay scroll, y sin esto no se podría deslizar
      // para recargar.
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(vertical: Espacio.sm),
      itemCount: reportes.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (_, i) => _FilaReporte(reportes[i]),
    );
  }
}

class _FilaReporte extends ConsumerWidget {
  const _FilaReporte(this.reporte);

  final ReporteMio reporte;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    final secundario = tema.colorScheme.onSurfaceVariant;
    final VoidCallback? alTocar = reporte.publicado
        ? () => context.push(Rutas.reporte(reporte.id))
        : reporte.tieneFicha
        ? () => mostrarFicha(context, reporte.incidenteId!)
        : null;

    // TalkBack lee la fila entera de una vez: categoría, fecha y estado. El
    // menú va aparte, para que se pueda elegir solo.
    final fila = MergeSemantics(
      child: InkWell(
        onTap: alTocar,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: Espacio.lg,
            vertical: Espacio.md,
          ),
          child: Row(
            children: [
              _Miniatura(reporte.fotoIds.firstOrNull),
              const SizedBox(width: Espacio.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reporte.categoriaNombre,
                      style: tema.textTheme.titleMedium,
                    ),
                    Text(
                      fechaLarga(reporte.registradoEn),
                      style: tema.textTheme.bodySmall?.copyWith(
                        color: secundario,
                      ),
                    ),
                    const SizedBox(height: Espacio.sm),
                    _EtiquetaReporte(reporte),
                  ],
                ),
              ),
              if (alTocar != null) Icon(Icons.chevron_right, color: secundario),
            ],
          ),
        ),
      ),
    );
    return Row(
      children: [
        Expanded(child: fila),
        PopupMenuButton<String>(
          tooltip: 'Opciones de tu reporte de ${reporte.categoriaNombre}',
          onSelected: (_) => _eliminar(context, ref),
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'eliminar', child: Text('Eliminar')),
          ],
        ),
      ],
    );
  }

  /// Con confirmación. Si el servidor no deja (es el único reporte de su
  /// problema), se muestra su explicación y el reporte queda.
  Future<void> _eliminar(BuildContext context, WidgetRef ref) async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (contexto) => AlertDialog(
        title: Text('¿Eliminar tu reporte de ${reporte.categoriaNombre}?'),
        content: const Text('No se puede deshacer.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(contexto, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(contexto, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmado != true || !context.mounted) return;
    try {
      await ref.read(repositorioMisReportesProvider).eliminar(reporte.id);
      if (!context.mounted) return;
      ref.invalidate(misReportesProvider);
      ref.invalidate(feedProvider);
    } catch (error) {
      if (context.mounted) mostrarError(context, error);
    }
  }
}

/// Los mismos textos, íconos y colores que el mapa, más «Desestimado», que el
/// mapa nunca muestra. Si el incidente caducó, en vez de su estado va cuándo
/// caducó: es lo que explica que ya no se pueda abrir. Si el reporte propio se
/// desestimó, gana «Desestimado».
class _EtiquetaReporte extends StatelessWidget {
  const _EtiquetaReporte(this.reporte);

  final ReporteMio reporte;

  @override
  Widget build(BuildContext context) {
    final estado = reporte.estado;
    if (estado == EstadoIncidente.desestimado) {
      return Etiqueta(
        texto: 'Desestimado',
        icono: Icons.block,
        color: Theme.of(context).extension<ColoresEstado>()!.desestimado,
      );
    }
    // Caducar no es un estado del incidente: va sin color de estado.
    if (reporte.caducadoEn case final caducadoEn?) {
      return Etiqueta.neutra(
        texto: 'Caducó el ${fechaLarga(caducadoEn)}',
        icono: Icons.event_busy,
      );
    }
    return EtiquetaEstado(EstadoVisible.desdeApi(estado.valorApi));
  }
}

/// La foto se baja con la sesión ([fotoMiaProvider]): así el vecino ve también
/// la de un reporte desestimado o la de un incidente que salió del mapa.
class _Miniatura extends ConsumerWidget {
  const _Miniatura(this.fotoId);

  final int? fotoId;

  static const _lado = 64.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    // Sin foto, o si no se pudo bajar o mostrar, queda este recuadro.
    final noDisponible = ColoredBox(
      color: tema.colorScheme.surfaceContainerLow,
      child: Center(
        child: Icon(
          Icons.hide_image_outlined,
          color: tema.colorScheme.onSurfaceVariant,
          semanticLabel: 'Foto no disponible',
        ),
      ),
    );

    return ClipRRect(
      borderRadius: BorderRadius.circular(radioBorde),
      child: SizedBox.square(
        dimension: _lado,
        child: switch (fotoId) {
          null => noDisponible,
          final id =>
            ref
                .watch(fotoMiaProvider(id))
                .when(
                  data: (archivo) => Image.memory(
                    archivo,
                    fit: BoxFit.cover,
                    excludeFromSemantics: true,
                    // La foto llega entera (sin recomprimir, varios MB). Se
                    // decodifica chica para que una lista larga no llene la
                    // memoria; el doble del lado alcanza para que una foto
                    // apaisada cubra el cuadrado.
                    cacheWidth:
                        (_lado * 2 * MediaQuery.devicePixelRatioOf(context))
                            .round(),
                    errorBuilder: (_, _, _) => noDisponible,
                  ),
                  loading: () =>
                      ColoredBox(color: tema.colorScheme.surfaceContainerLow),
                  error: (_, _) => noDisponible,
                ),
        },
      ),
    );
  }
}

class _SinReportes extends StatelessWidget {
  const _SinReportes(this.alReportar);

  final VoidCallback alReportar;

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
                    Icons.list_alt_outlined,
                    size: Espacio.xxxl,
                    color: tema.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(height: Espacio.lg),
                  Text(
                    'Todavía no hiciste reportes',
                    textAlign: TextAlign.center,
                    style: tema.textTheme.titleMedium,
                  ),
                  const SizedBox(height: Espacio.xs),
                  Text(
                    'Cuando reportes un problema, acá vas a ver en qué estado '
                    'está.',
                    textAlign: TextAlign.center,
                    style: tema.textTheme.bodyMedium?.copyWith(
                      color: tema.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: Espacio.xl),
                  FilledButton.icon(
                    icon: const Icon(Icons.add_a_photo_outlined),
                    label: const Text('Reportar un problema'),
                    onPressed: alReportar,
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

class _Esqueleto extends StatelessWidget {
  const _Esqueleto();

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.surfaceContainerLow;
    Widget bloque(double ancho, double alto) => Container(
      width: ancho,
      height: alto,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radioBorde),
      ),
    );

    return Semantics(
      label: 'Cargando tus reportes',
      child: ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(vertical: Espacio.sm),
        children: [
          for (var i = 0; i < 4; i++)
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: Espacio.lg,
                vertical: Espacio.md,
              ),
              child: Row(
                children: [
                  bloque(_Miniatura._lado, _Miniatura._lado),
                  const SizedBox(width: Espacio.md),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      bloque(160, 20),
                      const SizedBox(height: Espacio.xs),
                      bloque(120, 16),
                      const SizedBox(height: Espacio.sm),
                      bloque(100, 24),
                    ],
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
