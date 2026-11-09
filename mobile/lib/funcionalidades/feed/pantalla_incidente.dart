import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/mapa/capa_osm.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/tema/tema_app.dart';
import '../mapa/estados.dart';
import '../mapa/modelos.dart';
import '../mapa/repositorio_mapa.dart';
import 'carrusel_fotos.dart';
import 'social.dart';
import 'visor_fotos.dart';
import 'widgets_social.dart';

/// El detalle de un incidente que se abre desde el feed: todas sus fotos (el
/// antes y el después, si se resolvió), sus datos y dónde está.
class PantallaIncidente extends ConsumerWidget {
  const PantallaIncidente(this.id, {super.key});

  final int id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ficha = ref.watch(fichaProvider(id));
    return Scaffold(
      appBar: AppBar(title: Text(ficha.value?.categoriaNombre ?? 'Incidente')),
      body: SafeArea(
        child: switch (ficha) {
          AsyncData(:final value) => _Contenido(value),
          AsyncError(:final error) when !ficha.isLoading => Padding(
            padding: const EdgeInsets.all(Espacio.lg),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
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
          ),
          _ => const Center(
            child: CircularProgressIndicator(
              semanticsLabel: 'Cargando el incidente',
            ),
          ),
        },
      ),
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

    return ListView(
      children: [
        if (ficha.fotoCierreId case final fotoCierreId?)
          _AntesYDespues(ficha, fotoCierreId)
        else
          CarruselFotos(
            fotoIds: ficha.fotoIds,
            descripcion: ficha.categoriaNombre,
            alAmpliar: (i) => ampliarFotos(
              context,
              titulo: ficha.categoriaNombre,
              fotoIds: ficha.fotoIds,
              descripcion: ficha.categoriaNombre,
              inicial: i,
            ),
          ),
        Padding(
          padding: const EdgeInsets.all(Espacio.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(ficha.categoriaNombre, style: tema.textTheme.titleLarge),
              const SizedBox(height: Espacio.md),
              Wrap(
                spacing: Espacio.sm,
                runSpacing: Espacio.sm,
                children: [
                  EtiquetaEstado(ficha.estado),
                  if (ficha.gravedad case final gravedad?)
                    EtiquetaGravedad(gravedad),
                ],
              ),
              if (ficha.enRevision) ...[
                const SizedBox(height: Espacio.sm),
                Text(
                  'Todavía no se verificó: puede cambiar de categoría o '
                  'descartarse.',
                  style: secundario,
                ),
              ],
              const SizedBox(height: Espacio.lg),
              if (ficha.direccion case final direccion?)
                _Dato(Icons.place_outlined, 'Dirección', direccion),
              _Dato(
                Icons.event_outlined,
                'Primer reporte',
                fechaLarga(ficha.primerReporteEn),
              ),
              _Dato(
                Icons.group_outlined,
                'Vecinos que lo reportaron',
                '${ficha.cantidadVecinos}',
              ),
              if (ficha.resueltoEn case final resueltoEn?)
                _Dato(
                  Icons.check_circle_outline,
                  'Resuelto',
                  fechaLarga(resueltoEn),
                ),
              const SizedBox(height: Espacio.sm),
              _MapaChico(ficha),
              const SizedBox(height: Espacio.xl),
              _Reportes(ficha.id),
              const Divider(height: Espacio.xxl),
              SeccionComentarios(
                titulo: 'Comentarios del incidente',
                provider: comentariosDeIncidenteProvider(ficha.id),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Un incidente resuelto (F09): las fotos de los reportes (el antes) y la que
/// lo cerró (el después). Una sobre la otra: lado a lado quedan muy chicas en
/// el celular.
class _AntesYDespues extends StatelessWidget {
  const _AntesYDespues(this.ficha, this.fotoCierreId);

  final FichaIncidente ficha;
  final int fotoCierreId;

  @override
  Widget build(BuildContext context) {
    final antes = '${ficha.categoriaNombre}, antes';
    final despues =
        '${ficha.categoriaNombre}, después: cómo quedó al resolverse';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Rotulo('Antes'),
        CarruselFotos(
          fotoIds: ficha.fotoIds,
          descripcion: antes,
          alAmpliar: (i) => ampliarFotos(
            context,
            titulo: 'Antes',
            fotoIds: ficha.fotoIds,
            descripcion: antes,
            inicial: i,
          ),
        ),
        _Rotulo(switch (ficha.resueltoEn) {
          final resueltoEn? =>
            'Después · resuelto el ${fechaLarga(resueltoEn)}',
          null => 'Después',
        }),
        AspectRatio(
          aspectRatio: 4 / 3,
          child: FotoIncidente(
            fotoCierreId,
            descripcion: despues,
            alAmpliar: () => ampliarFotos(
              context,
              titulo: 'Después',
              fotoIds: [fotoCierreId],
              descripcion: despues,
            ),
          ),
        ),
      ],
    );
  }
}

class _Rotulo extends StatelessWidget {
  const _Rotulo(this.texto);

  final String texto;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: Espacio.lg,
        vertical: Espacio.sm,
      ),
      child: Semantics(
        header: true,
        child: Text(
          texto,
          style: tema.textTheme.labelMedium?.copyWith(
            color: tema.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _Dato extends StatelessWidget {
  const _Dato(this.icono, this.nombre, this.valor);

  final IconData icono;
  final String nombre;
  final String valor;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: Espacio.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icono, size: 20, color: tema.colorScheme.onSurfaceVariant),
          const SizedBox(width: Espacio.md),
          Expanded(
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
          ),
        ],
      ),
    );
  }
}

/// Dónde está, sin poder mover el mapa: es para ubicarse, no para navegar.
class _MapaChico extends StatelessWidget {
  const _MapaChico(this.ficha);

  final FichaIncidente ficha;

  @override
  Widget build(BuildContext context) {
    final punto = LatLng(ficha.lat, ficha.lon);
    return Semantics(
      label: 'Mapa con la ubicación del incidente',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radioBorde),
        child: SizedBox(
          height: 180,
          child: FlutterMap(
            options: MapOptions(
              initialCenter: punto,
              initialZoom: 16,
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.none,
              ),
            ),
            children: [
              const CapaOsm(),
              MarkerLayer(
                markers: [
                  Marker(
                    point: punto,
                    width: 32,
                    height: 32,
                    child: MarcaEstado(ficha.estado),
                  ),
                ],
              ),
              const AtribucionOsm(),
            ],
          ),
        ),
      ),
    );
  }
}

/// Una foto por vecino: al tocarla se abre con sus me gusta y comentarios.
class _Reportes extends ConsumerWidget {
  const _Reportes(this.incidenteId);

  final int incidenteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    final reportes = ref.watch(reportesDeIncidenteProvider(incidenteId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(switch (reportes) {
          AsyncData(:final value) => 'Fotos de los vecinos (${value.length})',
          _ => 'Fotos de los vecinos',
        }, style: tema.textTheme.titleMedium),
        const SizedBox(height: Espacio.md),
        switch (reportes) {
          AsyncData(:final value) => GridView.count(
            crossAxisCount: 2,
            mainAxisSpacing: Espacio.sm,
            crossAxisSpacing: Espacio.sm,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [for (final r in value) _FotoDeVecino(r)],
          ),
          AsyncError(:final error) when !reportes.isLoading => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              MensajeError(ErrorApi.desde(error).mensaje),
              const SizedBox(height: Espacio.sm),
              OutlinedButton(
                onPressed: () =>
                    ref.invalidate(reportesDeIncidenteProvider(incidenteId)),
                child: const Text('Reintentar'),
              ),
            ],
          ),
          _ => const Padding(
            padding: EdgeInsets.all(Espacio.lg),
            child: Center(
              child: CircularProgressIndicator(
                semanticsLabel: 'Cargando las fotos de los vecinos',
              ),
            ),
          ),
        },
      ],
    );
  }
}

class _FotoDeVecino extends StatelessWidget {
  const _FotoDeVecino(this.reporte);

  final ReportePublico reporte;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final fijos = tema.extension<ColoresFijos>()!;
    final sobreVelo = tema.textTheme.labelSmall?.copyWith(
      color: fijos.sobreVelo,
    );
    return Semantics(
      button: true,
      label:
          'Foto del ${reporte.autor.nombre}, ${reporte.cantidadMeGusta} me '
          'gusta, ${reporte.cantidadComentarios} comentarios',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radioBorde),
        child: Material(
          child: InkWell(
            onTap: () => context.push(Rutas.reporte(reporte.id)),
            child: ExcludeSemantics(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (reporte.fotoIds.isNotEmpty)
                    FotoIncidente(
                      reporte.fotoIds.first,
                      descripcion: 'Foto del ${reporte.autor.nombre}',
                    )
                  else
                    ColoredBox(color: tema.colorScheme.surfaceContainerLow),
                  // Una franja con el velo abajo, para que el autor se lea
                  // sobre cualquier foto.
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: ColoredBox(
                      color: fijos.velo,
                      child: Padding(
                        padding: const EdgeInsets.all(Espacio.sm),
                        child: Row(
                          children: [
                            AvatarAutor(reporte.autor, radio: 11),
                            const SizedBox(width: Espacio.xs),
                            Expanded(
                              child: Text(
                                reporte.autor.nombre,
                                style: sobreVelo,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Icon(
                              Icons.favorite,
                              size: 14,
                              color: fijos.sobreVelo,
                            ),
                            const SizedBox(width: 2),
                            Text(
                              '${reporte.cantidadMeGusta}',
                              style: sobreVelo,
                            ),
                          ],
                        ),
                      ),
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
