import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/tema/tema_app.dart';
import '../../config/entorno.dart';
import 'estados.dart';
import 'modelos.dart';
import 'repositorio_mapa.dart';

/// Abre la ficha del incidente [id] en una hoja desde abajo.
Future<void> mostrarFicha(BuildContext context, int id) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => FichaIncidenteHoja(id),
  );
}

class FichaIncidenteHoja extends ConsumerWidget {
  const FichaIncidenteHoja(this.id, {super.key});

  final int id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ficha = ref.watch(fichaProvider(id));
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(Espacio.lg, 0, Espacio.lg, Espacio.xl),
      child: switch (ficha) {
        AsyncData(:final value) => _Contenido(value),
        AsyncError(:final error) when !ficha.isLoading => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            MensajeError(ErrorApi.desde(error).mensaje),
            const SizedBox(height: Espacio.lg),
            OutlinedButton(
              onPressed: () => ref.invalidate(fichaProvider(id)),
              child: const Text('Reintentar'),
            ),
          ],
        ),
        _ => const _Esqueleto(),
      },
    );
  }
}

class _Contenido extends StatelessWidget {
  const _Contenido(this.ficha);

  final FichaIncidente ficha;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final secundario = tema.textTheme.bodySmall?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );
    final fotos = ficha.fotoIds;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(ficha.categoriaNombre, style: tema.textTheme.titleLarge),
        const SizedBox(height: Espacio.sm),
        EtiquetaEstado(ficha.estado),
        if (ficha.enRevision) ...[
          const SizedBox(height: Espacio.sm),
          Text(
            'Todavía no se verificó: puede cambiar de categoría o '
            'descartarse.',
            style: secundario,
          ),
        ],
        const SizedBox(height: Espacio.lg),
        _Dato('Primer reporte', fechaLarga(ficha.primerReporteEn)),
        _Dato('Vecinos que lo reportaron', '${ficha.cantidadVecinos}'),
        if (ficha.direccion case final direccion?)
          _Dato('Dirección', direccion),
        const SizedBox(height: Espacio.sm),
        if (fotos.isEmpty)
          Text('No hay fotos para mostrar.', style: secundario)
        else
          GridView.count(
            crossAxisCount: 2,
            mainAxisSpacing: Espacio.sm,
            crossAxisSpacing: Espacio.sm,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              for (final (i, fotoId) in fotos.indexed)
                _Foto(
                  fotoId,
                  descripcion:
                      'Foto ${i + 1} de ${fotos.length} de '
                      '${ficha.categoriaNombre}',
                ),
            ],
          ),
      ],
    );
  }
}

class _Dato extends StatelessWidget {
  const _Dato(this.nombre, this.valor);

  final String nombre;
  final String valor;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: Espacio.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            nombre,
            style: tema.textTheme.bodySmall?.copyWith(
              color: tema.colorScheme.onSurfaceVariant,
            ),
          ),
          Text(valor),
        ],
      ),
    );
  }
}

class _Foto extends StatelessWidget {
  const _Foto(this.id, {required this.descripcion});

  final int id;
  final String descripcion;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    Widget recuadro({Widget? child}) => ColoredBox(
      color: tema.colorScheme.surfaceContainerLow,
      child: Center(child: child),
    );

    // La descripción queda aunque la foto no cargue.
    return Semantics(
      container: true,
      image: true,
      label: descripcion,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radioBorde),
        child: Image.network(
          '${Entorno.apiUrl}/fotos/$id',
          fit: BoxFit.cover,
          excludeFromSemantics: true,
          loadingBuilder: (_, imagen, progreso) =>
              progreso == null ? imagen : recuadro(),
          errorBuilder: (_, _, _) => recuadro(
            child: Padding(
              padding: const EdgeInsets.all(Espacio.sm),
              child: Text(
                'No se pudo cargar la foto',
                textAlign: TextAlign.center,
                style: tema.textTheme.bodySmall?.copyWith(
                  color: tema.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
        ),
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
      margin: const EdgeInsets.only(bottom: Espacio.sm),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radioBorde),
      ),
    );

    return Semantics(
      label: 'Cargando la ficha',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          bloque(200, 24),
          bloque(100, 24),
          bloque(160, 40),
          bloque(160, 40),
          bloque(150, 150),
        ],
      ),
    );
  }
}
