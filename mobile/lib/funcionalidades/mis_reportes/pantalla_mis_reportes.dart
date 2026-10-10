import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/errores/aviso_error.dart';
import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/tema/tema_app.dart';
import '../../config/entorno.dart';
import '../mapa/estados.dart';
import '../mapa/ficha_incidente.dart';
import '../mapa/modelos.dart';
import 'modelos.dart';
import 'repositorio_mis_reportes.dart';

/// Los reportes del vecino con el estado de cada uno. Tocar uno abre la ficha
/// de su incidente, la misma del mapa.
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

class _FilaReporte extends StatelessWidget {
  const _FilaReporte(this.reporte);

  final ReporteMio reporte;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final secundario = tema.colorScheme.onSurfaceVariant;
    final abreFicha = reporte.tieneFicha;

    // TalkBack lee la fila entera de una vez: categoría, fecha y estado.
    return MergeSemantics(
      child: InkWell(
        onTap: abreFicha
            ? () => mostrarFicha(context, reporte.incidenteId!)
            : null,
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
                    _EtiquetaReporte(reporte.estado),
                  ],
                ),
              ),
              if (abreFicha) Icon(Icons.chevron_right, color: secundario),
            ],
          ),
        ),
      ),
    );
  }
}

/// Los mismos textos, íconos y colores que el mapa, más «Desestimado», que el
/// mapa nunca muestra.
class _EtiquetaReporte extends StatelessWidget {
  const _EtiquetaReporte(this.estado);

  final EstadoIncidente estado;

  @override
  Widget build(BuildContext context) {
    if (estado == EstadoIncidente.desestimado) {
      return Etiqueta(
        texto: 'Desestimado',
        icono: Icons.block,
        color: Theme.of(context).extension<ColoresEstado>()!.desestimado,
      );
    }
    return EtiquetaEstado(EstadoVisible.desdeApi(estado.valorApi));
  }
}

class _Miniatura extends StatelessWidget {
  const _Miniatura(this.fotoId);

  final int? fotoId;

  static const _lado = 64.0;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    // Hoy el servidor no le da a su dueño la foto de un reporte desestimado ni
    // la de un incidente que salió del mapa (404): queda este recuadro.
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
          final id => Image.network(
            '${Entorno.apiUrl}/fotos/$id',
            fit: BoxFit.cover,
            excludeFromSemantics: true,
            // La foto llega entera (sin recomprimir, varios MB). Se decodifica
            // chica para que una lista larga no llene la memoria; el doble del
            // lado alcanza para que una foto apaisada cubra el cuadrado.
            cacheWidth: (_lado * 2 * MediaQuery.devicePixelRatioOf(context))
                .round(),
            loadingBuilder: (_, imagen, progreso) => progreso == null
                ? imagen
                : ColoredBox(color: tema.colorScheme.surfaceContainerLow),
            errorBuilder: (_, _, _) => noDisponible,
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
